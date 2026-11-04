import { useContext, useState } from 'react'
import {
  deleteProtein, foodsWithoutKcal, goalFor, kcalEatenOn, kcalGoalFor, logFood, proteinOn, updateEntry, useStore,
} from '../data/store'
import Header from '../components/Header'
import { NO_FOOD, type Meal, type Nutrients, type ProteinEntry } from '../data/types'
import { useDay } from '../lib/dayContext'
import { portionText } from '../lib/nutrition'
import { macroLine, timeOf } from '../lib/format'
import { myFoodsFrom } from '../lib/myFoods'
import { recordMiss } from '../lib/misses'
import { isAiFood } from '../lib/aiEstimate'
import { useFoods } from '../lib/useFoods'
import { SettingsContext } from '../lib/settingsContext'
import ProteinSummary from '../components/ProteinRing'
import QuickAdds from '../components/QuickAdds'
import PastFoods from '../components/PastFoods'
import MealPicker from '../components/MealPicker'
import { groupMeals, mealAt, mealOf } from '../lib/meals'
import FoodFinder, { PortionPicker } from '../components/FoodFinder'
import MacrosPanel from '../components/MacrosPanel'

// The Food tab (was "Protein"): protein ring + calories, one-tap saved foods, search the food list, today's entries.


export default function Protein() {
  const store = useStore()
  const { day: today, isToday, label } = useDay()
  const meals = groupMeals(proteinOn(store, today))
  const [macros, setMacros] = useState(false)
  // Which meal new foods go to (TF-63): starts at the one the time suggests, one tap to change
  const [meal, setMeal] = useState<Meal>(() => mealAt())
  const openSettings = useContext(SettingsContext)
  const unlinked = foodsWithoutKcal(store).length

  return (
    <>
      <Header title="Food" aside={`Goal ${goalFor(store, today)} g`} />
      <div className="card">
        <ProteinSummary>
          <button className="btn ghost small macros-btn" aria-expanded={macros} onClick={() => setMacros(!macros)}>{macros ? 'Hide macros' : 'Macros'}</button>
        </ProteinSummary>
        <KcalLine />
        {macros && <MacrosPanel />}
      </div>
      <MealPicker value={meal} onChange={setMeal} label="Logging to" />
      <QuickAdds offerStarters meal={meal} />
      {unlinked > 0 && (
        <p className="cap nudge">
          {unlinked === 1 ? '1 saved food has' : `${unlinked} saved foods have`} no calories ·{' '}
          <button className="link small" onClick={openSettings}>Fix</button>
        </p>
      )}
      <AddFood meal={meal} />
      <PastFoods meal={meal} />

      <h2 className="sec">{isToday ? 'Today’s entries' : `Entries · ${label}`}</h2>
      {meals.length ? meals.map((m) => (
        <section key={m.key} className="group">
          <div className="hdr meal-head">
            <b>{m.name}</b>
            <span className="cap">{m.grams} g protein{m.kcal != null ? ` · ${m.kcal} kcal` : ''}</span>
          </div>
          <div className="list">{m.entries.map((e) => <EntryRow key={e.id} entry={e} />)}</div>
        </section>
      )) : (
        <p className="cap empty">{isToday ? 'Nothing logged yet today.' : 'Nothing logged on this day.'}</p>
      )}
    </>
  )
}

// Calories eaten today, under the protein ring: a graphite meter when a target is set
function KcalLine() {
  const store = useStore()
  const { day: today } = useDay()
  const { total, missing } = kcalEatenOn(store, today)
  const goal = kcalGoalFor(store, today)
  return (
    <div className="kcal-line">
      <div className="hdr">
        <span><span className="num">{total}</span> <span className="cap">{goal ? `/ ${goal} kcal` : 'kcal eaten'}</span></span>
        <span className="cap">{goal ? (total <= goal ? `${goal - total} left` : `${total - goal} over`) : 'Set a target in Settings'}</span>
      </div>
      {goal && <span className="meter" role="img" aria-label={`${total} of ${goal} kcal`}><span style={{ width: `${Math.min(total / goal, 1) * 100}%` }} /></span>}
      {missing > 0 && <span className="cap">{missing === 1 ? '1 entry has' : `${missing} entries have`} protein only, no calories.</span>}
    </div>
  )
}

// ---------- Adding food: search the list (or ask AI), or type the numbers ----------

function AddFood({ meal }: { meal: Meal }) {
  const { day } = useDay()
  const [manual, setManual] = useState<string | null>(null)   // the search text carried over as the name
  if (manual !== null) return <ManualForm initialLabel={manual} meal={meal} onSearch={() => setManual(null)} />
  return (
    <FoodFinder
      submitLabel="Log" saveQuick
      onDone={(n, ref, name) => logFood({ ...n, ...ref, label: name }, day, meal)}
      footer={(q) => (
        <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => { if (q) recordMiss(q, 'typed'); setManual(q) }}>
          Or type the numbers (from a label)
        </button>
      )}
    />
  )
}

// Something not in the list (e.g. from a pack label): type what you know. Protein, kcal or an amount is enough
// (an amount alone covers zero-calorie items like creatine, TF-64); the rest is optional.
function ManualForm({ initialLabel, meal, onSearch }: { initialLabel: string; meal: Meal; onSearch: () => void }) {
  const { day } = useDay()
  const [label, setLabel] = useState(initialLabel.trim())
  const [vals, setVals] = useState<Vals>(toVals())
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmBig, setConfirmBig] = useState(false)
  const grams = amount.trim() ? Number(amount.replace(',', '.')) : null

  function submit(e: React.FormEvent, force = false) {
    e.preventDefault()
    if (grams != null && !(grams > 0 && grams <= 2000)) return setError('Check the amount (up to 2000 g).')
    const r = readVals(vals, !!grams)
    if ('error' in r) return setError(r.error)
    if (r.n.grams > 300 && !force) return setConfirmBig(true)
    if (!label.trim() && !r.n.grams && !r.n.kcal) return setError('Name it, e.g. Creatine.')
    logFood({ ...r.n, ...NO_FOOD, portion_grams: grams ? Math.round(grams * 10) / 10 : null, label: label || null }, day, meal)
    setLabel(''); setVals(toVals()); setAmount(''); setError(null); setConfirmBig(false)
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <input className="full" aria-label="What you ate (optional)" placeholder="What you ate (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
      <NutrientFields vals={vals} onChange={(v) => { setVals(v); setError(null); setConfirmBig(false) }} />
      <label className="label-row">
        <span className="cap">Amount, g (optional)</span>
        <input className="num small-input" inputMode="decimal" aria-label="Amount in grams" placeholder="–" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null) }} />
      </label>
      <p className="cap note">Leave a box empty if you don’t know it. Pack labels list these per serving. No calories (creatine)? Just the name and amount.</p>
      {error && <p className="err" role="alert">{error}</p>}
      {confirmBig && (
        <div className="confirm">
          <span>More than 300 g of protein in one entry. Log it anyway?</span>
          <button type="button" className="btn ghost" onClick={(e) => submit(e as unknown as React.FormEvent, true)}>Log it</button>
        </div>
      )}
      <div className="two">
        <button type="button" className="btn ghost" onClick={onSearch}>Search instead</button>
        <button className="btn" type="submit">Log</button>
      </div>
    </form>
  )
}

// ---------- Nutrient fields (typed entries and edits) ----------

// Protein and kcal first; the rest optional. Empty = unknown (stays out of totals, flagged in Macros).
const FIELDS: [keyof Nutrients, string, number][] = [
  ['grams', 'Protein g', 1000], ['kcal', 'kcal', 5000], ['carbs_g', 'Carbs g', 1000],
  ['fat_g', 'Fat g', 1000], ['fiber_g', 'Fibre g', 300], ['added_sugar_g', 'Sugar g', 1000],
]
type Vals = Record<keyof Nutrients, string>
const toVals = (n?: Partial<Nutrients>): Vals =>
  Object.fromEntries(FIELDS.map(([k]) => [k, n?.[k] == null ? '' : String(n[k])])) as Vals

// Parse the boxes: whole numbers (the database stores whole grams), empty optional fields become null
// hasAmount: an amount was given, so zero protein and kcal is fine (creatine, TF-64)
function readVals(v: Vals, hasAmount = false): { n: Nutrients } | { error: string } {
  const out: Record<string, number | null> = {}
  for (const [k, label, max] of FIELDS) {
    const raw = v[k].trim().replace(',', '.')
    if (!raw) { out[k] = k === 'grams' ? 0 : null; continue }
    const x = Math.round(Number(raw))
    if (!Number.isFinite(Number(raw)) || x < 0 || x > max) return { error: `Check ${label.toLowerCase()} (0 to ${max}).` }
    out[k] = x
  }
  if (out.grams === 0 && !out.kcal && !hasAmount) return { error: 'Enter protein grams, kcal or the amount.' }
  return { n: out as Nutrients }
}

function NutrientFields({ vals, onChange }: { vals: Vals; onChange: (v: Vals) => void }) {
  return (
    <div className="ai-grid">
      {FIELDS.map(([k, label]) => (
        <label key={k} className={k === 'grams' ? 'tone-protein' : undefined}>
          <span className="cap">{label}</span>
          <input className="num" inputMode="decimal" aria-label={label} placeholder="–" value={vals[k]} onChange={(e) => onChange({ ...vals, [k]: e.target.value })} />
        </label>
      ))}
    </div>
  )
}

// ---------- Today's entries ----------

function EntryRow({ entry }: { entry: ProteinEntry }) {
  const foods = useFoods()
  const [editing, setEditing] = useState<false | 'portion' | 'numbers'>(false)
  // A list food edits by portion; so do packs, AI estimates and label foods, rebuilt from the entry's own numbers
  const own = entry.food_id && entry.portion_grams ? myFoodsFrom([entry])[0] : undefined
  const food = foods?.foodById(entry.food_id) ?? (own && { ...own, id: entry.food_id! })
  const ai = isAiFood(entry.food_id)
  const about = food?.confidence === 'estimate' || ai ? 'about ' : ''

  if (!editing) {
    const portion = portionText(entry)
    return (
      <button className="row" onClick={() => setEditing('portion')}>
        <span className="row-main">
          <span>{entry.label ?? 'Protein'}</span>
          <span className="cap">{ai ? 'AI estimate · ' : ''}{portion ? `${portion} · ` : ''}{timeOf(entry.logged_at)}</span>
          {macroLine(entry) && <span className="cap">{macroLine(entry)}</span>}
        </span>
        <span className="row-nums">
          <span className="num">{about && <span className="cap">{about}</span>}{entry.grams} g</span>
          {entry.kcal != null && <span className="cap">{entry.kcal} kcal</span>}
        </span>
      </button>
    )
  }

  const mealRow = <MealPicker value={mealOf(entry)} onChange={(m) => updateEntry(entry.id, { meal: m })} label="Meal" />
  // Edited by its portion, so protein and calories stay consistent; the numbers form is the fallback
  if (editing === 'portion' && food && entry.portion_grams) {
    const portion = entry.portion_label ? food.portions.find((p) => p.label === entry.portion_label) ?? null : null
    const qty = portion ? entry.portion_qty ?? 1 : entry.portion_grams
    return (
      <div className="form">{mealRow}<PortionPicker
        food={food} portion={portion} qty={qty} submitLabel="Save"
        onSubmit={(n, ref) => { updateEntry(entry.id, { ...n, ...ref }); setEditing(false) }}
        onCancel={() => setEditing(false)}
        onDelete={() => deleteProtein(entry.id)}
        note={<button type="button" className="link small" onClick={() => setEditing('numbers')}>Edit the numbers instead</button>}
      /></div>
    )
  }
  return <div className="form">{mealRow}<TypedEdit entry={entry} onClose={() => setEditing(false)} /></div>
}

// Typed entries (and AI estimates, or a food no longer in the list): edit the numbers directly,
// or link the entry to a food from the list so it gets calories and macros
function TypedEdit({ entry, onClose }: { entry: ProteinEntry; onClose: () => void }) {
  const [linking, setLinking] = useState(false)
  const [vals, setVals] = useState<Vals>(toVals(entry))
  const [label, setLabel] = useState(entry.label ?? '')
  const [error, setError] = useState<string | null>(null)

  // Every number is editable, so editing one no longer throws the others away
  function save(e: React.FormEvent) {
    e.preventDefault()
    const r = readVals(vals, !!entry.portion_grams)
    if ('error' in r) return setError(r.error)
    updateEntry(entry.id, { ...r.n, label: label || null })
    onClose()
  }

  if (linking) {
    return (
      <FoodFinder
        initialQuery={entry.label ?? ''} submitLabel="Link"
        note={`Was ${entry.grams} g protein${entry.kcal != null ? `, ${entry.kcal} kcal` : ', no calories'}. Linking replaces it with the food’s values.`}
        onDone={(n, ref, name) => { updateEntry(entry.id, { ...n, ...ref, label: name }); onClose() }}
        onCancel={() => setLinking(false)}
      />
    )
  }

  return (
    <form className="card form" onSubmit={save} noValidate>
      <input className="full" aria-label="Label" placeholder="Protein" value={label} onChange={(e) => setLabel(e.target.value)} />
      <NutrientFields vals={vals} onChange={(v) => { setVals(v); setError(null) }} />
      {error && <p className="err" role="alert">{error}</p>}
      <div className="three">
        <button type="button" className="link danger" onClick={() => deleteProtein(entry.id)}>Delete</button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn">Save</button>
      </div>
      {!entry.food_id && (
        <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setLinking(true)}>
          Link to a food{entry.kcal == null ? ' (adds calories and macros)' : ''}
        </button>
      )}
    </form>
  )
}
