import { useState } from 'react'
import { EVENING_HOUR, groupsOn, habitsOn, lastSession, todaySession, useStore } from '../data/store'
import { GROUPS, type Exercise } from '../data/types'
import { addDays, fmtDate, fmtDay, localDate } from '../lib/dates'
import { fmtSets } from '../lib/format'
import Header from '../components/Header'
import QuickAdds from '../components/QuickAdds'
import HabitsCard from '../components/HabitsCard'
import { HabitsTile, KcalTile, ProteinTile } from '../components/DayTiles'
import PastDay from './PastDay'
import GoodDayLine from '../components/GoodDayLine'

type Props = {
  onOpenExercise: (id: string, repeat: boolean) => void
  onGoToLift: () => void
  onGoToProtein: () => void
}

const LOOK_BACK = 7     // past days you can open from the date

const dayLabel = (d: string, today: string) =>
  d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : `${fmtDay(d)} ${fmtDate(d)}`

export default function Today({ onOpenExercise, onGoToLift, onGoToProtein }: Props) {
  const store = useStore()
  const today = localDate()
  const groups = groupsOn(store, today)
  const habits = habitsOn(store, today)
  const habitsDone = [habits.sugar, habits.junk_food].filter(Boolean).length
  const [showHabits, setShowHabits] = useState(false)
  const [day, setDay] = useState<string | null>(null)   // null = today, even after midnight
  const [picking, setPicking] = useState(false)
  const viewing = day && day < today && day >= addDays(today, -LOOK_BACK) ? day : today
  const habitsVisible = showHabits || habitsDone > 0 || new Date().getHours() >= EVENING_HOUR

  // Exercises for today's split (or everything if no split yet) that have history, most recent first
  const recent = (e: Exercise) => lastSession(store, e.id)?.local_date ?? ''
  const pool = store.exercises
    .filter((e) => !groups.length || groups.includes(e.muscle_group))
    .filter((e) => lastSession(store, e.id) || todaySession(store, e.id))
    .sort((a, b) => recent(b).localeCompare(recent(a)))
  const featured = pool.find((e) => !todaySession(store, e.id))
  const rest = pool.filter((e) => e !== featured).slice(0, 3)

  return (
    <>
      <Header
        title={viewing === today ? 'Today' : viewing === addDays(today, -1) ? 'Yesterday' : new Date(`${viewing}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })}
        aside={
          <button className="date-btn" aria-expanded={picking} onClick={() => setPicking(!picking)}>
            {new Date(`${viewing}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} <span aria-hidden="true">▾</span>
          </button>
        }
      />
      {picking && (
        <div className="chips" role="group" aria-label="Pick a day">
          {Array.from({ length: LOOK_BACK + 1 }, (_, i) => addDays(today, -i)).map((d) => (
            <button key={d} className="chip" aria-pressed={d === viewing} onClick={() => { setDay(d === today ? null : d); setPicking(false) }}>{dayLabel(d, today)}</button>
          ))}
        </div>
      )}

      {viewing !== today ? (
        <>
          <div className="past-note">
            <span className="cap">Past day, view only</span>
            <button className="link" onClick={() => setDay(null)}>Back to today</button>
          </div>
          <PastDay date={viewing} />
        </>
      ) : (<>
      <div className="tiles food">
        <ProteinTile date={today} onOpen={onGoToProtein} />
        <KcalTile date={today} onOpen={onGoToProtein} />
        <HabitsTile date={today} onOpen={() => setShowHabits(true)} />
      </div>
      <GoodDayLine date={today} />

      <QuickAdds />

      <div className="hdr sec-row">
        <span className="sec">{groups.length ? GROUPS.filter((g) => groups.includes(g)).join(', ') : 'Last time'}</span>
        <button className="link" onClick={onGoToLift}>{groups.length ? 'Change' : 'Pick split'}</button>
      </div>

      {!store.loaded && !store.exercises.length ? (
        <p className="cap empty">Loading…</p>
      ) : !pool.length ? (
        <p className="cap empty">Your last weights show here once you’ve logged a session.</p>
      ) : (
        <>
          {featured ? <Featured exercise={featured} onOpen={onOpenExercise} /> : <p className="cap empty">Today’s split is done. Nice work.</p>}
          {rest.length > 0 && (
            <div className="list">
              {rest.map((e) => {
                const done = todaySession(store, e.id)
                const shown = done ?? lastSession(store, e.id)!
                return (
                  <button key={e.id} className="row" onClick={() => onOpenExercise(e.id, false)}>
                    <span className="row-main">
                      <span>{e.name}</span>
                      <span className="cap">{done ? 'Done today' : fmtDate(shown.local_date)}</span>
                    </span>
                    <span className="num row-weights">{fmtSets(shown.sets)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {habitsVisible && <HabitsCard />}
      </>)}
    </>
  )
}

function Featured({ exercise, onOpen }: { exercise: Exercise; onOpen: (id: string, repeat: boolean) => void }) {
  const store = useStore()
  const last = lastSession(store, exercise.id)!
  return (
    <div className="slab">
      <button className="slab-open" onClick={() => onOpen(exercise.id, false)}>
        <span className="cap">{exercise.name}</span>
        <span className="num slab-weights">{fmtSets(last.sets)}</span>
      </button>
      <div className="slab-foot">
        <span className="cap">Last on {fmtDate(last.local_date)}</span>
        <button className="btn" onClick={() => onOpen(exercise.id, true)}>Repeat</button>
      </div>
    </div>
  )
}
