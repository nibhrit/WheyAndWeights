import { useState } from 'react'
import { EVENING_HOUR, MIN_FOODS, cardioOn, groupsOn, habitsOn, proteinOn, useStore } from '../data/store'
import { GROUPS, cardioName, effortName } from '../data/types'
import { addDays, localDate } from '../lib/dates'
import { fmtSets } from '../lib/format'
import { LOOK_BACK, dayLabel, useDay } from '../lib/dayContext'
import Header from '../components/Header'
import QuickAdds from '../components/QuickAdds'
import HabitsCard from '../components/HabitsCard'
import { HabitsTile, KcalTile, ProteinTile } from '../components/DayTiles'
import GoodDayLine from '../components/GoodDayLine'

type Props = {
  onOpenExercise: (id: string, repeat: boolean) => void
  onGoToLift: () => void
  onGoToProtein: () => void
  onGoToCardio: () => void
}

const fullDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

// Only the chosen day: today by default, or a past day picked from the date (the whole app then logs to it)
export default function Today({ onOpenExercise, onGoToLift, onGoToProtein, onGoToCardio }: Props) {
  const store = useStore()
  const { day, setDay, isToday } = useDay()
  const [picking, setPicking] = useState(false)
  const [showHabits, setShowHabits] = useState(false)
  const groups = groupsOn(store, day)
  const habits = habitsOn(store, day)
  const evening = new Date().getHours() >= EVENING_HOUR
  const habitsVisible = !isToday || showHabits || !!(habits.sugar || habits.junk_food) || evening
  const foods = proteinOn(store, day).length

  const lifts = store.sessions
    .filter((x) => x.local_date === day)
    .sort((a, b) => a.performed_at.localeCompare(b.performed_at))
  const cardio = cardioOn(store, day)
  const nameOf = (id: string) => store.exercises.find((e) => e.id === id)?.name ?? 'Exercise'

  return (
    <>
      <Header
        title={isToday ? 'Today' : day === addDays(localDate(), -1) ? 'Yesterday' : new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })}
        aside={
          <button className="date-btn" aria-expanded={picking} onClick={() => setPicking(!picking)}>
            {fullDate(day)} <span aria-hidden="true">▾</span>
          </button>
        }
      />
      {picking && <DayPicker current={day} onPick={(d) => { setDay(d); setPicking(false) }} />}

      <div className="tiles food">
        <ProteinTile date={day} onOpen={onGoToProtein} />
        <KcalTile date={day} onOpen={onGoToProtein} />
        <HabitsTile date={day} onOpen={() => setShowHabits(true)} />
      </div>
      <GoodDayLine date={day} />

      {isToday && evening && foods < MIN_FOODS && (
        <div className="card nudge-card">
          <span>{foods === 0 ? 'No food logged today yet.' : 'Only 1 food logged today.'} Add the rest so your calories and protein are right.</span>
          <button className="btn ghost small" onClick={onGoToProtein}>Log food</button>
        </div>
      )}

      <QuickAdds />

      <div className="hdr sec-row">
        <span className="sec">{groups.length ? GROUPS.filter((g) => groups.includes(g)).join(', ') : 'Workout'}</span>
        <button className="link" onClick={onGoToLift}>{lifts.length ? 'Add exercise' : groups.length ? 'Change' : 'Pick split'}</button>
      </div>

      {!store.loaded && !store.exercises.length ? (
        <p className="cap empty">Loading…</p>
      ) : !lifts.length && !cardio.length ? (
        <div className="card start-card">
          <span className="cap">{isToday ? 'No workout logged yet today.' : 'No workout logged on this day.'}</span>
          <button className="btn" onClick={onGoToLift}>{isToday ? 'Start workout' : 'Log a workout'}</button>
        </div>
      ) : (
        <div className="list">
          {lifts.map((x) => (
            <button key={x.id} className="row" onClick={() => onOpenExercise(x.exercise_id, false)}>
              <span className="row-main">
                <span>{nameOf(x.exercise_id)}</span>
                <span className="cap">{x.sets.length} {x.sets.length === 1 ? 'set' : 'sets'}</span>
              </span>
              <span className="num row-weights">{fmtSets(x.sets)}</span>
            </button>
          ))}
          {cardio.map((c) => (
            <button key={c.id} className="row" onClick={onGoToCardio}>
              <span className="row-main">
                <span>{cardioName(c.kind)}</span>
                <span className="cap">{effortName(c.effort)}</span>
              </span>
              <span className="num row-weights">{c.minutes} min</span>
            </button>
          ))}
        </div>
      )}

      {habitsVisible && <HabitsCard />}
    </>
  )
}

function DayPicker({ current, onPick }: { current: string; onPick: (d: string | null) => void }) {
  const today = localDate()
  const days = Array.from({ length: LOOK_BACK + 1 }, (_, i) => addDays(today, -i))
  return (
    <div className="chips" role="group" aria-label="Pick a day">
      {days.map((d, i) => (
        <button key={d} className="chip" aria-pressed={d === current} onClick={() => onPick(i === 0 ? null : d)}>{dayLabel(d)}</button>
      ))}
    </div>
  )
}
