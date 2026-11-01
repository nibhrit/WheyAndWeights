import { activeHabits, habitAnswer, habitsOn, setHabitAnswer, useStore } from '../data/store'
import { ANSWERS } from '../data/types'
import { useDay } from '../lib/dayContext'
import { addDays, fmtDay } from '../lib/dates'

// End-of-day check-in for your own habits (TF-65). The good answer (Done, Avoided) is green; the other (Missed,
// Had it) is graphite, never red: a slip isn't an error. Tap an answer again to clear it.
// trend: a 7-day row under the habits (all kept / some missed / not logged), for Today (TF-66)
export default function HabitsCard({ onEdit, trend = false }: { onEdit?: () => void; trend?: boolean }) {
  const store = useStore()
  const { day: date, isToday } = useDay()
  const list = activeHabits(store)
  const h = habitsOn(store, date)
  const done = h.total > 0 && h.answered === h.total

  return (
    <div className="card form">
      <div className="hdr">
        <b>End of day</b>
        <span className="cap">{done ? (isToday ? 'Logged for today' : 'Logged') : isToday ? 'Log before bed' : 'Not logged'}</span>
      </div>
      {!list.length && <span className="cap">No habits yet.</span>}
      {list.map((habit) => {
        const a = habitAnswer(store, date, habit.id)
        const [yes, no] = ANSWERS[habit.kind]
        return (
          <div key={habit.id} className="habit-row">
            <span className="habit-name">{habit.name}</span>
            <div className="seg" role="group" aria-label={habit.name}>
              <button className="ok" aria-pressed={a === 'yes'} onClick={() => setHabitAnswer(habit.id, 'yes', date)}>{yes}</button>
              <button className="no" aria-pressed={a === 'no'} onClick={() => setHabitAnswer(habit.id, 'no', date)}>{no}</button>
            </div>
          </div>
        )
      })}
      {trend && list.length > 0 && <HabitWeek date={date} />}
      {onEdit && <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={onEdit}>{list.length ? 'Edit habits' : 'Add habits'}</button>}
    </div>
  )
}

function HabitWeek({ date }: { date: string }) {
  const store = useStore()
  const days = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6))
  const state = days.map((d) => { const h = habitsOn(store, d); return !h.answered ? 'none' : h.good === h.total ? 'ok' : 'had' })
  const kept = state.filter((x) => x === 'ok').length
  return (
    <div className="habit-week">
      <div className="habit-dots" role="img" aria-label={`All habits kept on ${kept} of the last 7 days`}>
        {days.map((d, i) => (
          <span key={d} className="habit-dot-col"><span className={`mini ${state[i]}`} /><span className="minibar-day">{fmtDay(d).slice(0, 1)}</span></span>
        ))}
      </div>
      <span className="cap">All habits kept {kept}/7</span>
    </div>
  )
}
