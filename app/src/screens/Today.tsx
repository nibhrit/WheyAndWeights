import { useContext, useState } from 'react'
import { SettingsContext } from '../lib/settingsContext'
import { EVENING_HOUR, MIN_FOODS, proteinOn, useStore } from '../data/store'
import { addDays, localDate } from '../lib/dates'
import { LOOK_BACK, dayLabel, useDay } from '../lib/dayContext'
import Header from '../components/Header'
import QuickAdds from '../components/QuickAdds'
import HabitsCard from '../components/HabitsCard'
import GoodDayLine from '../components/GoodDayLine'
import ProteinCard from '../components/today/ProteinCard'
import CaloriesCard from '../components/today/CaloriesCard'
import WorkoutBanner from '../components/today/WorkoutBanner'

type Props = {
  onGoToLift: () => void
  onGoToProtein: () => void
}

const fullDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

// Today as a metrics page (TF-66): protein, net calories, workout, habits, each with its week's trend.
// Shows the chosen day: today by default, or a past day picked from the date (the whole app then logs to it).
export default function Today({ onGoToLift, onGoToProtein }: Props) {
  const store = useStore()
  const { day, setDay, isToday } = useDay()
  const [picking, setPicking] = useState(false)
  const openSettings = useContext(SettingsContext)
  const evening = new Date().getHours() >= EVENING_HOUR
  const foods = proteinOn(store, day).length

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
      <GoodDayLine date={day} />

      <ProteinCard date={day} onOpen={onGoToProtein} />
      <CaloriesCard date={day} onOpen={onGoToProtein} onSetTarget={openSettings} />

      {isToday && evening && foods < MIN_FOODS && (
        <div className="card nudge-card">
          <span>{foods === 0 ? 'No food logged today yet. Log your meals' : 'Only 1 food logged today. Add the rest'} so your calories and protein are right.</span>
          <button className="btn ghost small" onClick={onGoToProtein}>Log food</button>
        </div>
      )}

      <WorkoutBanner date={day} isToday={isToday} onOpen={onGoToLift} />
      <HabitsCard onEdit={openSettings} trend />
      <QuickAdds />
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
