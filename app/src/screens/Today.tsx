import { useContext } from 'react'
import { SettingsContext } from '../lib/settingsContext'
import { EVENING_HOUR, MIN_FOODS, proteinOn, useStore } from '../data/store'
import { addDays, localDate } from '../lib/dates'
import { LOOK_BACK, useDay } from '../lib/dayContext'
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
  const openSettings = useContext(SettingsContext)
  const evening = new Date().getHours() >= EVENING_HOUR
  const foods = proteinOn(store, day).length

  return (
    <>
      <Header
        title={isToday ? 'Today' : day === addDays(localDate(), -1) ? 'Yesterday' : new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })}
      />
      <DayNav current={day} onPick={setDay} />
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

// ‹ [ Wed 4 Nov ▾ ] › (TF-72): arrows step a day (today back to LOOK_BACK days), the date opens a list to jump
function DayNav({ current, onPick }: { current: string; onPick: (d: string | null) => void }) {
  const today = localDate()
  const oldest = addDays(today, -LOOK_BACK)
  const days = Array.from({ length: LOOK_BACK + 1 }, (_, i) => addDays(today, -i))
  const go = (d: string) => onPick(d === today ? null : d)
  const name = (d: string, i: number) => (i === 0 ? 'Today' : i === 1 ? 'Yesterday' : fullDate(d))
  return (
    <div className="day-nav" role="group" aria-label="Day">
      <button className="icon-btn day-arrow" aria-label="Previous day" disabled={current <= oldest} onClick={() => go(addDays(current, -1))}>‹</button>
      <span className="day-select">
        <select aria-label="Pick a day" value={current} onChange={(e) => go(e.target.value)}>
          {days.map((d, i) => <option key={d} value={d}>{i < 2 ? `${name(d, i)}, ${fullDate(d)}` : name(d, i)}</option>)}
        </select>
        <span className="day-select-face" aria-hidden="true">{fullDate(current)} <span className="chev">▾</span></span>
      </span>
      <button className="icon-btn day-arrow" aria-label="Next day" disabled={current >= today} onClick={() => go(addDays(current, 1))}>›</button>
    </div>
  )
}
