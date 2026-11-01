import { activeHabits, habitAnswer, habitsOn, setHabitAnswer, useStore } from '../data/store'
import { ANSWERS } from '../data/types'
import { useDay } from '../lib/dayContext'

// End-of-day check-in for your own habits (TF-65). The good answer (Done, Avoided) is green; the other (Missed,
// Had it) is graphite, never red: a slip isn't an error. Tap an answer again to clear it.
export default function HabitsCard({ onEdit }: { onEdit?: () => void }) {
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
      {onEdit && <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={onEdit}>{list.length ? 'Edit habits' : 'Add habits'}</button>}
    </div>
  )
}
