import { cardioOn, useStore } from '../../data/store'
import { GROUPS } from '../../data/types'

// "Workout done · Back, Triceps" instead of a list of exercises (TF-66); taps through to Lift
export default function WorkoutBanner({ date, isToday, onOpen }: { date: string; isToday: boolean; onOpen: () => void }) {
  const store = useStore()
  const lifts = store.sessions.filter((x) => x.local_date === date)
  const cardio = cardioOn(store, date)
  const groups = GROUPS.filter((g) => lifts.some((x) => store.exercises.find((e) => e.id === x.exercise_id)?.muscle_group === g))
  const minutes = cardio.reduce((n, c) => n + c.minutes, 0)
  const done = lifts.length > 0 || cardio.length > 0
  const detail = [
    lifts.length && `${lifts.length} ${lifts.length === 1 ? 'exercise' : 'exercises'}`,
    lifts.length && `${lifts.reduce((n, x) => n + x.sets.length, 0)} sets`,
    minutes && `${minutes} min cardio`,
  ].filter(Boolean).join(' · ')

  return (
    <button className={`workout-banner${done ? ' done' : ''}`} onClick={onOpen}>
      <span className="row-main">
        <b>{done ? `Workout done${groups.length ? ` · ${groups.join(', ')}` : cardio.length ? ' · Cardio' : ''}` : isToday ? 'No workout yet' : 'No workout logged'}</b>
        <span className="cap">{done ? detail : isToday ? 'Pick today’s split on Lift' : 'Nothing logged on this day'}</span>
      </span>
      <span className={done ? 'chev' : 'btn small'}>{done ? '›' : isToday ? 'Start' : 'Log'}</span>
    </button>
  )
}
