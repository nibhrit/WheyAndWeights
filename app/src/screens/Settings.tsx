import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { activeHabits, addHabit, bodyKg, clearUser, moveHabit, removeHabit, updateHabit, fitnessGoal, goalFor, kcalGoalFor, setWeightUnit, useStore } from '../data/store'
import { localDate } from '../lib/dates'
import { ANSWERS, MAX_HABITS, type Habit, type HabitKind } from '../data/types'
import { CalorieGoalSetting, FitnessGoalSetting, GoalSetting, SavedFoods } from '../components/ProteinSettings'
import { PROTEIN_PER_KG, suggestedKcal } from '../lib/macros'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { loadMisses, type MissSummary } from '../lib/misses'
import {
  currentSubscription, disableReminders, enableReminders, loadReminderSettings, permission, pushSupport, saveReminderSettings, sendTest,
  type ReminderSettings,
} from '../lib/push'

const FOOD_DATA_URL = 'https://github.com/nibhrit/WheyAndWeights/blob/main/product/FOOD_DATA.md'

type Props = { session: Session; onClose: () => void }

// Rarely changed setup lives here, so the daily screens stay focused on logging
export default function Settings({ session, onClose }: Props) {
  const store = useStore()
  const [synced, setSynced] = useState<'checking' | 'ok' | 'error'>('checking')

  // Reads the user's own settings row: confirms the database recognises this login.
  useEffect(() => {
    supabase.from('user_settings').select('user_id').maybeSingle()
      .then(({ data, error }) => setSynced(!error && data ? 'ok' : 'error'))
  }, [])

  const unit = store.settings.body_weight_unit
  const goal = fitnessGoal(store)

  return (
    <>
      <button className="link back" onClick={onClose}>‹ Back</button>
      <div className="hdr"><h1>Settings</h1></div>

      <h2 className="sec">Food</h2>
      <FitnessGoalSetting current={goal} />
      <GoalSetting current={goalFor(store, localDate())} suggested={Math.round(PROTEIN_PER_KG[goal] * bodyKg(store).kg)} />
      <CalorieGoalSetting current={kcalGoalFor(store, localDate())} suggested={suggestedKcal(goal, bodyKg(store).kg)} goal={goal} />
      <SavedFoods quickAdds={store.quickAdds} />
      <FoodsNotFound />
      <p className="cap empty">
        Nutrition data: USDA FoodData Central (public domain). Dishes are Whey & Weights recipes from those ingredients; restaurant dishes are estimates.
        Packaged foods: <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer" style={{ color: 'var(--lift)', fontWeight: 600 }}>Open Food Facts</a> (ODbL), looked up live.
        Approximate, not medical advice.{' '}
        <a href={FOOD_DATA_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--lift)', fontWeight: 600 }}>Food data sources</a>
      </p>

      <h2 className="sec">Habits</h2>
      <HabitsSetting habits={activeHabits(store)} />

      <h2 className="sec">Body weight</h2>
      <div className="card hdr">
        <span>Unit</span>
        <div className="seg small" role="group" aria-label="Body weight unit">
          <button className="pick" aria-pressed={unit === 'kg'} onClick={() => setWeightUnit('kg')}>kg</button>
          <button className="pick" aria-pressed={unit === 'lb'} onClick={() => setWeightUnit('lb')}>lb</button>
        </div>
      </div>

      <h2 className="sec">Reminders</h2>
      <RemindersSetting />

      <h2 className="sec">Appearance</h2>
      <AppearanceSetting />

      <h2 className="sec">Account</h2>
      <div className="card form">
        <b style={{ overflowWrap: 'anywhere' }}>{session.user.email}</b>
        <span className="cap">
          {synced === 'checking' ? 'Checking sync…' : synced === 'ok' ? 'Your data syncs across your devices.' : 'Couldn’t reach your data. Check your connection.'}
        </span>
        <button className="btn ghost" onClick={() => { clearUser(); supabase.auth.signOut() }}>Sign out</button>
      </div>
    </>
  )
}

function AppearanceSetting() {
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const pick = (t: Theme) => { setTheme(t); setThemeState(t) }
  return (
    <div className="card form">
      <div className="seg" role="group" aria-label="Appearance">
        {([['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as const).map(([t, label]) => (
          <button key={t} className="pick" aria-pressed={theme === t} onClick={() => pick(t)}>{label}</button>
        ))}
      </div>
      <span className="cap">System follows your phone’s light or dark mode. Saved on this device.</span>
    </div>
  )
}

const REMINDERS: [key: 'workout' | 'protein' | 'food', label: string, when: string][] = [
  ['workout', 'Workout day', 'if a split is planned and nothing is logged'],
  ['protein', 'Protein check', 'if you’re under your protein goal'],
  ['food', 'Log your food', 'if fewer than 2 foods are logged'],
]
// Every 15 minutes from 5 am to 11:45 pm (the server checks every 15 minutes)
const TIMES = Array.from({ length: 76 }, (_, i) => {
  const m = 5 * 60 + i * 15
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})
const label12 = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

// Phone reminders (TF-20): on/off for this device, which reminders and when (shared by all your devices), a test
function RemindersSetting() {
  const support = pushSupport()
  const [on, setOn] = useState<boolean | null>(null)          // this device subscribed?
  const [settings, setSettings] = useState<ReminderSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (support !== 'ok') return
    currentSubscription().then((s) => setOn(!!s && permission() === 'granted'))
    loadReminderSettings().then(setSettings)
  }, [support])

  if (support === 'install') {
    return (
      <div className="card form">
        <b>Add the app to your Home Screen first</b>
        <span className="cap">On iPhone, reminders only work in the installed app: in Safari, tap Share → Add to Home Screen, then open Whey&amp;Weights from there and come back here.</span>
      </div>
    )
  }
  if (support === 'unsupported') return <p className="cap empty">This browser can’t show reminders.</p>

  async function turnOn() {
    setBusy(true); setNote(null)
    const err = await enableReminders()
    setBusy(false)
    if (err) return setNote(err)
    setOn(true)
    setSettings(await loadReminderSettings())
  }
  async function turnOff() {
    setBusy(true); setNote(null)
    const err = await disableReminders()
    setBusy(false)
    if (err) setNote(err); else setOn(false)
  }
  async function change(patch: Partial<ReminderSettings>) {
    if (!settings) return
    const before = settings
    setSettings({ ...settings, ...patch })
    const err = await saveReminderSettings(patch)
    if (err) { setSettings(before); setNote(err) }
  }

  if (on === null) return <p className="cap empty">Checking…</p>
  return (
    <div className="card form">
      {!on ? (
        <>
          <span className="cap">Get a nudge on this device only when you’re falling behind: a planned workout not started, protein under goal, or food not logged.</span>
          <button className="btn" disabled={busy} onClick={turnOn}>{busy ? 'Turning on…' : 'Turn on reminders'}</button>
        </>
      ) : settings && (
        <>
          {REMINDERS.map(([k, label, when]) => (
            <div key={k} className="reminder-row">
              <label className="reminder-toggle">
                <input type="checkbox" checked={settings[`${k}_on`]} onChange={(e) => change({ [`${k}_on`]: e.target.checked })} />
                <span><span>{label}</span><span className="cap">{when}</span></span>
              </label>
              <select aria-label={`${label} time`} value={settings[`${k}_at`].slice(0, 5)} disabled={!settings[`${k}_on`]}
                onChange={(e) => change({ [`${k}_at`]: `${e.target.value}:00` })}>
                {TIMES.map((t) => <option key={t} value={t}>{label12(t)}</option>)}
              </select>
            </div>
          ))}
          <span className="cap">Each one is sent at most once a day, and only if it’s still true at that time.</span>
          <div className="two">
            <button className="btn ghost" disabled={busy} onClick={async () => setNote(await sendTest())}>Send a test</button>
            <button className="btn ghost" disabled={busy} onClick={turnOff}>Turn off here</button>
          </div>
        </>
      )}
      {note && <p className="cap" role="status" style={{ margin: 0 }}>{note}</p>}
    </div>
  )
}

const OUTCOME: Record<string, string> = { ai: 'AI', typed: 'typed', none: 'skipped' }

// Searches that didn't find the food (TF-60): private to you; copy the list to share it for the next food update
function FoodsNotFound() {
  const [open, setOpen] = useState(false)
  const [misses, setMisses] = useState<MissSummary[] | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (open && misses === undefined) loadMisses().then(setMisses) }, [open, misses])
  const text = (misses ?? []).map((m) => `${m.query}${m.times > 1 ? ` (${m.times}×)` : ''}`).join('\n')
  return (
    <>
      <button className="row disclose" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>Foods not found</span>
        <span aria-hidden="true" className="chev">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="card form">
          {misses === undefined ? <span className="cap">Loading…</span>
            : misses === null ? <span className="cap">Couldn’t load. Check your connection.</span>
            : !misses.length ? <span className="cap">Nothing yet. Searches that don’t find a food show up here.</span>
            : (
              <>
                <span className="cap">Searches from the last 60 days that didn’t find the food. Only you can see these.</span>
                <div className="miss-list">
                  {misses.slice(0, 30).map((m) => (
                    <div key={m.query} className="hdr"><span>{m.query}</span><span className="cap">{m.times > 1 ? `${m.times}× · ` : ''}{m.outcomes.map((o) => OUTCOME[o]).join(', ')}</span></div>
                  ))}
                </div>
                <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {})}>
                  {copied ? 'Copied' : 'Copy the list'}
                </button>
              </>
            )}
        </div>
      )}
    </>
  )
}

const KIND_TEXT: Record<HabitKind, string> = { do: `Do · ${ANSWERS.do.join(' / ')}`, avoid: `Avoid · ${ANSWERS.avoid.join(' / ')}` }

// Your own habits (TF-65): add, rename, switch kind, reorder, remove (history kept)
function HabitsSetting({ habits }: { habits: Habit[] }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<HabitKind>('do')
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="card form">
      <span className="cap">Answered at the end of each day. “Do” habits are Done / Missed (brush twice a day, creatine); “Avoid” habits are Avoided / Had it (sugar, junk food).</span>
      {habits.map((h, i) => <HabitEditRow key={h.id} habit={h} first={i === 0} last={i === habits.length - 1} />)}
      {habits.length < MAX_HABITS ? (
        <form className="form" onSubmit={(e) => { e.preventDefault(); const err = addHabit(name, kind); setError(err); if (!err) setName('') }} noValidate>
          <input className="full" placeholder="New habit, e.g. Brush twice a day" aria-label="New habit" value={name} maxLength={40}
            onChange={(e) => { setName(e.target.value); setError(null) }} />
          <div className="seg small" role="group" aria-label="Kind of habit">
            <button type="button" className="pick" aria-pressed={kind === 'do'} onClick={() => setKind('do')}>Do</button>
            <button type="button" className="pick" aria-pressed={kind === 'avoid'} onClick={() => setKind('avoid')}>Avoid</button>
          </div>
          {error && <p className="err" role="alert">{error}</p>}
          <button className="btn ghost" type="submit">Add habit</button>
        </form>
      ) : <span className="cap">That’s {MAX_HABITS} habits, the most you can have. Remove one to add another.</span>}
    </div>
  )
}

function HabitEditRow({ habit, first, last }: { habit: Habit; first: boolean; last: boolean }) {
  const [name, setName] = useState(habit.name)
  const save = () => { if (name.trim() && name.trim() !== habit.name) updateHabit(habit.id, { name }) ; else setName(habit.name) }
  return (
    <div className="form" style={{ gap: 4 }}>
      <div className="habit-edit">
        <input aria-label={`Rename ${habit.name}`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        <button className="icon-btn" aria-label={`Move ${habit.name} up`} disabled={first} onClick={() => moveHabit(habit.id, -1)}>↑</button>
        <button className="icon-btn" aria-label={`Move ${habit.name} down`} disabled={last} onClick={() => moveHabit(habit.id, 1)}>↓</button>
      </div>
      <div className="hdr">
        <button className="link small" onClick={() => updateHabit(habit.id, { kind: habit.kind === 'do' ? 'avoid' : 'do' })}>
          <span className="kind-tag">{KIND_TEXT[habit.kind]}</span> · change
        </button>
        <button className="link small danger" onClick={() => removeHabit(habit.id)}>Remove</button>
      </div>
    </div>
  )
}
