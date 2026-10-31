import { useState } from 'react'
import { addExercise, addStarters, lastSession, splitFor, toggleSplit, todaySession, useStore } from '../data/store'
import { fmtSets } from '../lib/format'
import { fmtDate } from '../lib/dates'
import { useDay } from '../lib/dayContext'
import PlanWeek from './PlanWeek'
import { GROUPS, STARTERS, type Exercise, type MuscleGroup, type Unit } from '../data/types'
import ExerciseDetail from './ExerciseDetail'
import Header from '../components/Header'

// Set when another screen (Today) opens an exercise; `key` changes on every request
export type LiftTarget = { id: string; repeat: boolean; key: number }

export default function Lift({ target }: { target?: LiftTarget | null }) {
  const store = useStore()
  const { loaded, exercises } = store
  const { day: today, isToday, label } = useDay()
  const [openId, setOpenId] = useState<string | null>(target?.id ?? null)
  const [repeat, setRepeat] = useState(target?.repeat ?? false)
  const [targetKey, setTargetKey] = useState(target?.key)
  const [planning, setPlanning] = useState(false)
  const [adding, setAdding] = useState(false)
  const [showRest, setShowRest] = useState<boolean | null>(null)

  if (target && target.key !== targetKey) {
    setTargetKey(target.key)
    setOpenId(target.id)
    setRepeat(target.repeat)
    setPlanning(false)
  }

  const open = exercises.find((e) => e.id === openId)
  if (open) return <ExerciseDetail key={open.id} exercise={open} repeat={repeat} onBack={() => { setOpenId(null); setRepeat(false) }} />
  if (planning) return <PlanWeek onBack={() => setPlanning(false)} />

  const split = splitFor(store, today)
  const groups = GROUPS.filter((g) => exercises.some((e) => e.muscle_group === g))
  // Today's workout: exercises logged today, in the order they were done
  const done = store.sessions
    .filter((x) => x.local_date === today)
    .sort((a, b) => a.performed_at.localeCompare(b.performed_at))
    .map((x) => exercises.find((e) => e.id === x.exercise_id))
    .filter((e): e is Exercise => !!e)
  const doneIds = new Set(done.map((e) => e.id))
  // Everything else in today's split (all groups when no split is picked); most recently trained first
  const lastDate = (e: Exercise) => lastSession(store, e.id, today)?.local_date ?? ''
  const rest = groups
    .filter((g) => !split.length || split.includes(g))
    .map((g) => [g, exercises
      .filter((e) => e.muscle_group === g && !doneIds.has(e.id))
      .sort((a, b) => lastDate(b).localeCompare(lastDate(a)) || a.name.localeCompare(b.name))] as const)
    .filter(([, list]) => list.length)
  const restCount = rest.reduce((n, [, list]) => n + list.length, 0)
  // Open by default until something is logged, then collapsed so today's workout leads
  const restOpen = showRest ?? done.length === 0
  const openEx = (id: string) => { setOpenId(id); setRepeat(false) }

  return (
    <>
      <Header
        title="Lift"
        action={exercises.length > 0 && (
          <button className="icon-btn add" aria-label="Add exercise" aria-expanded={adding} onClick={() => setAdding(!adding)}>+</button>
        )}
      />
      {adding && <AddExercise defaultGroup={split[0] ?? 'Chest'} onDone={() => setAdding(false)} />}

      {!loaded && !exercises.length ? (
        <div className="card cap">Loading your exercises…</div>
      ) : !exercises.length ? (
        <Starters />
      ) : (
        <>
          <select
            id="pick-exercise" aria-label="Choose exercise" value=""
            onChange={(e) => { if (e.target.value) openEx(e.target.value) }}
          >
            <option value="">Choose exercise</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {exercises.filter((e) => e.muscle_group === g).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </optgroup>
            ))}
          </select>

          <div className="hdr sec-row">
            <span className="sec">{isToday ? 'Today’s split' : 'Split'}</span>
            <button className="link" onClick={() => setPlanning(true)}>Plan week</button>
          </div>
          <div className="chips" role="group" aria-label="Split for the day">
            {groups.map((g) => (
              <button key={g} className="chip" aria-pressed={split.includes(g)} onClick={() => toggleSplit(g, today)}>{g}</button>
            ))}
          </div>

          <section className="group">
            <h2 className="sec">{isToday ? 'Today’s workout' : `Workout · ${label}`}</h2>
            {done.length ? (
              <div className="list">{done.map((e) => <ExerciseRow key={e.id} exercise={e} onOpen={() => openEx(e.id)} />)}</div>
            ) : (
              <p className="cap empty">{isToday ? 'Nothing logged yet today.' : 'Nothing logged on this day.'} Pick an exercise above or from the split below.</p>
            )}
          </section>

          {restCount > 0 && (
            <button className="row disclose" aria-expanded={restOpen} onClick={() => setShowRest(!restOpen)}>
              <span>{split.length ? 'Add from your split' : 'All exercises'} <span className="cap">({restCount})</span></span>
              <span aria-hidden="true" className="chev">{restOpen ? '▴' : '▾'}</span>
            </button>
          )}
          {restOpen && rest.map(([g, list]) => (
            <section key={g} className="group">
              <h2 className="sec">{g}</h2>
              <div className="list">
                {list.map((e) => <ExerciseRow key={e.id} exercise={e} onOpen={() => openEx(e.id)} />)}
              </div>
            </section>
          ))}
        </>
      )}

      {!exercises.length && loaded && <AddExercise defaultGroup="Chest" />}
    </>
  )
}

function ExerciseRow({ exercise, onOpen }: { exercise: Exercise; onOpen: () => void }) {
  const store = useStore()
  const { day, isToday } = useDay()
  const today = todaySession(store, exercise.id, day)
  const shown = today ?? lastSession(store, exercise.id, day)
  return (
    <button className="row" onClick={onOpen}>
      <span className="row-main">
        <span>{exercise.name}</span>
        <span className="cap">{today ? `${today.sets.length} ${today.sets.length === 1 ? 'set' : 'sets'}${isToday ? ' today' : ''}` : shown ? fmtDate(shown.local_date) : 'Not logged yet'}</span>
      </span>
      {shown && <span className="num row-weights">{fmtSets(shown.sets)}</span>}
    </button>
  )
}

function Starters() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="card form">
      <b>Start with common exercises</b>
      <p className="cap" style={{ margin: 0 }}>
        Adds {STARTERS.length} exercises across all muscle groups, like bench press, lat pulldown and leg press.
        Dumbbell exercises use lb, the rest kg. Rename, change or remove any of them later.
      </p>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn" disabled={busy} onClick={async () => { setBusy(true); setError(await addStarters()); setBusy(false) }}>
        {busy ? 'Adding…' : `Add ${STARTERS.length} starter exercises`}
      </button>
      <p className="cap" style={{ margin: 0 }}>Or add your own below.</p>
    </div>
  )
}

function AddExercise({ defaultGroup, onDone }: { defaultGroup: MuscleGroup; onDone?: () => void }) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState<MuscleGroup | ''>('')
  const [unit, setUnit] = useState<Unit>('kg')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const err = await addExercise(name, group || defaultGroup, unit)
    setBusy(false)
    setError(err)
    if (!err) { setName(''); setGroup(''); onDone?.() }
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <label htmlFor="new-exercise">Add an exercise</label>
      <input
        id="new-exercise" placeholder="Seated row, machine 5" value={name} autoComplete="off"
        onChange={(e) => { setName(e.target.value); setError(null) }}
      />
      <div className="two">
        <select id="new-group" aria-label="Muscle group" value={group || defaultGroup} onChange={(e) => setGroup(e.target.value as MuscleGroup)}>
          {GROUPS.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select id="new-unit" aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
          <option value="kg">kg</option>
          <option value="lb">lb</option>
        </select>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add exercise'}</button>
    </form>
  )
}
