import { habitsOn, setHabit, useStore } from '../data/store'
import type { HabitKey } from '../data/types'
import { useDay } from '../lib/dayContext'

const HABITS: [HabitKey, string][] = [['sugar', 'Sugar'], ['junk_food', 'Junk food']]

// End-of-day check-in. "Avoided" is green; "Had it" is graphite (never red: a slip isn't an error).
export default function HabitsCard() {
  const store = useStore()
  const { day: date, isToday } = useDay()
  const day = habitsOn(store, date)
  const done = day.sugar && day.junk_food

  return (
    <div className="card form">
      <div className="hdr">
        <b>End of day</b>
        <span className="cap">{done ? (isToday ? 'Logged for today' : 'Logged') : isToday ? 'Log before bed' : 'Not logged'}</span>
      </div>
      {HABITS.map(([key, label]) => (
        <div key={key} className="habit-row">
          <span>{label}</span>
          <div className="seg" role="group" aria-label={label}>
            <button className="ok" aria-pressed={day[key] === 'avoided'} onClick={() => setHabit(key, 'avoided', date)}>Avoided</button>
            <button className="no" aria-pressed={day[key] === 'had'} onClick={() => setHabit(key, 'had', date)}>Had it</button>
          </div>
        </div>
      ))}
    </div>
  )
}
