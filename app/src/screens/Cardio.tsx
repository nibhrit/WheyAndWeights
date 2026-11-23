import { useState } from 'react'
import { bodyKg, cardioOn, deleteCardio, kcalOn, logCardio, updateCardio, useStore } from '../data/store'
import { CARDIO_KINDS, EFFORTS, cardioName, effortName, type Cardio as CardioEntry, type CardioKind, type Effort } from '../data/types'
import { fmtDate } from '../lib/dates'
import { cardioKcal } from '../lib/calories'
import Header from '../components/Header'
import { useDay } from '../lib/dayContext'
import { SKIPS_PER_MIN, formInput, measureOf, measureText, resolveCardio, type MeasureInput } from '../lib/cardioMeasures'

const QUICK_MINUTES = [15, 20, 30, 45]

export default function Cardio() {
  const store = useStore()
  const { day: today, isToday, label } = useDay()
  const entries = [...cardioOn(store, today)].reverse()
  const kcal = kcalOn(store, today)

  // Most recent session of each type (before today), for one-tap repeat
  const recent = [...store.cardio].reverse()
    .filter((c) => c.local_date < today)
    .filter((c, i, all) => all.findIndex((x) => x.kind === c.kind) === i)
    .slice(0, 3)

  return (
    <>
      <Header title="Cardio" aside={kcal.cardio ? `about ${kcal.cardio} kcal${isToday ? ' today' : ''}` : undefined} />
      <LogCardio />

      {recent.length > 0 && (
        <>
          <h2 className="sec">Repeat</h2>
          <div className="chips scroll">
            {recent.map((c) => (
              <button key={c.id} className="chip" onClick={() => logCardio(c.kind, c.minutes, c.effort, today, { skips: c.skips ?? null, rounds: c.rounds ?? null, work_s: c.work_s ?? null, rest_s: c.rest_s ?? null })}>
                + {cardioName(c.kind)} <b>{measureText(c)}</b>
              </button>
            ))}
          </div>
        </>
      )}

      <h2 className="sec">{label}</h2>
      {entries.length ? (
        <div className="list">{entries.map((c) => <CardioRow key={c.id} entry={c} />)}</div>
      ) : (
        <p className="cap empty">{isToday ? 'No cardio logged today.' : 'No cardio logged on this day.'}</p>
      )}
    </>
  )
}

function LogCardio() {
  const store = useStore()
  const { day } = useDay()
  const [kind, setKind] = useState<CardioKind>('treadmill_run')
  const [v, setV] = useState<MeasureInput>(() => formInput('treadmill_run'))
  const [effort, setEffort] = useState<Effort>('moderate')
  const [error, setError] = useState<string | null>(null)
  const { kg, estimated } = bodyKg(store)
  const r = resolveCardio(kind, effort, v)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if ('error' in r) return setError(r.error)
    logCardio(kind, r.minutes, effort, day, r.measures)
    setV(formInput(kind))
    setError(null)
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <select id="cardio-kind" aria-label="Type of cardio" value={kind} onChange={(e) => { const k = e.target.value as CardioKind; setKind(k); setV(formInput(k)); setError(null) }}>
        {CARDIO_KINDS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
      <MeasureFields kind={kind} v={v} onChange={(x) => { setV(x); setError(null) }} minutes={'error' in r ? null : r.minutes} />
      <EffortPicker value={effort} onChange={setEffort} kind={kind} />
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn" type="submit">
        {'error' in r ? 'Log cardio' : `Log · about ${Math.round(cardioKcal(kind, effort, r.minutes, kg))} kcal`}
      </button>
      {estimated && <p className="cap" style={{ margin: 0 }}>Calories assume 70 kg until you log your weight on Week.</p>}
    </form>
  )
}

// What to type for each type (TF-74): minutes; skips (minutes optional); or rounds of work / rest in seconds
function MeasureFields({ kind, v, onChange, minutes }: { kind: CardioKind; v: MeasureInput; onChange: (v: MeasureInput) => void; minutes: number | null }) {
  const m = measureOf(kind)
  const set = (k: keyof MeasureInput) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...v, [k]: e.target.value })
  if (m === 'skips') {
    return (
      <div className="measure-grid two-col">
        <label><span className="cap">Skips</span><input className="num" inputMode="numeric" placeholder="500" aria-label="Number of skips" value={v.skips} onChange={set('skips')} /></label>
        <label><span className="cap">Minutes (optional)</span><input className="num" inputMode="numeric" placeholder={minutes ? `about ${minutes}` : '–'} aria-label="Minutes, optional" value={v.minutes} onChange={set('minutes')} /></label>
      </div>
    )
  }
  if (m === 'rounds') {
    return (
      <>
        <div className="measure-grid">
          <label><span className="cap">Rounds</span><input className="num" inputMode="numeric" aria-label="Rounds" value={v.rounds} onChange={set('rounds')} /></label>
          <label><span className="cap">Work, sec</span><input className="num" inputMode="numeric" aria-label="Work seconds per round" value={v.work_s} onChange={set('work_s')} /></label>
          <label><span className="cap">Rest, sec</span><input className="num" inputMode="numeric" aria-label="Rest seconds per round" value={v.rest_s} onChange={set('rest_s')} /></label>
        </div>
        {minutes != null && <span className="cap">{minutes} min in total, rests included</span>}
      </>
    )
  }
  const n = Number(v.minutes)
  return (
    <div className="entry-row">
      <input id="cardio-min" className="num" inputMode="numeric" placeholder="Minutes" aria-label="Minutes" value={v.minutes} onChange={set('minutes')} />
      <div className="seg small" role="group" aria-label="Quick minutes">
        {QUICK_MINUTES.slice(1, 3).map((q) => (
          <button key={q} type="button" className="pick" aria-pressed={n === q} onClick={() => onChange({ ...v, minutes: String(q) })}>{q}</button>
        ))}
      </div>
      <span />
    </div>
  )
}

// Skipping effort is its pace, so the buttons say so
function EffortPicker({ value, onChange, kind }: { value: Effort; onChange: (e: Effort) => void; kind: CardioKind }) {
  return (
    <div className="seg" role="group" aria-label="Effort">
      {EFFORTS.map(([id, name]) => (
        <button key={id} type="button" className="pick" aria-pressed={value === id} onClick={() => onChange(id)}>
          {name}{kind === 'skipping' && <span className="seg-sub">{SKIPS_PER_MIN[id]} a min</span>}
        </button>
      ))}
    </div>
  )
}

function CardioRow({ entry }: { entry: CardioEntry }) {
  const store = useStore()
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState<MeasureInput>(() => formInput(entry.kind, entry))
  const [effort, setEffort] = useState<Effort>(entry.effort)
  const [error, setError] = useState<string | null>(null)
  const kcal = Math.round(cardioKcal(entry.kind, entry.effort, entry.minutes, bodyKg(store).kg))
  const measured = measureOf(entry.kind) !== 'minutes' && (entry.skips || entry.rounds)

  if (!editing) {
    return (
      <button className="row" onClick={() => { setV(formInput(entry.kind, entry)); setEffort(entry.effort); setEditing(true) }}>
        <span className="row-main">
          <span>{cardioName(entry.kind)}</span>
          <span className="cap">{effortName(entry.effort)}{measured ? ` · ${entry.minutes} min` : ''} · about {kcal} kcal</span>
        </span>
        <span className="num row-weights">{measureText(entry)}</span>
      </button>
    )
  }

  const r = resolveCardio(entry.kind, effort, v)
  function save(e: React.FormEvent) {
    e.preventDefault()
    if ('error' in r) return setError(r.error)
    updateCardio(entry.id, { minutes: r.minutes, effort, ...r.measures })
    setEditing(false)
  }

  return (
    <form className="card form" onSubmit={save} noValidate>
      <b>{cardioName(entry.kind)}, {fmtDate(entry.local_date)}</b>
      <MeasureFields kind={entry.kind} v={v} onChange={(x) => { setV(x); setError(null) }} minutes={'error' in r ? null : r.minutes} />
      <EffortPicker value={effort} onChange={setEffort} kind={entry.kind} />
      {error && <p className="err" role="alert">{error}</p>}
      <div className="three">
        <button type="button" className="link danger" onClick={() => deleteCardio(entry.id)}>Delete</button>
        <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
        <button type="submit" className="btn">Save</button>
      </div>
    </form>
  )
}
