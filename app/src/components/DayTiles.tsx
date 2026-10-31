import { goalFor, habitsOn, kcalEatenOn, kcalGoalFor, kcalOn, proteinTotal, useStore } from '../data/store'

// The three summary tiles at the top of Today, for any date.
// With onOpen they're buttons; without (a past day) they're read-only.
type TileProps = { date: string; onOpen?: () => void }

function Tile({ onOpen, className = 'tile', label, children }: { onOpen?: () => void; className?: string; label: string; children: React.ReactNode }) {
  return onOpen
    ? <button className={className} onClick={onOpen} aria-label={label}>{children}</button>
    : <div className={className} role="group" aria-label={label}>{children}</div>
}

export function ProteinTile({ date, onOpen }: TileProps) {
  const store = useStore()
  const total = proteinTotal(store, date)
  const goal = goalFor(store, date)
  const C = 2 * Math.PI * 40
  const filled = Math.min(total / goal, 1) * C
  return (
    <Tile className="tile tile-ring" onOpen={onOpen} label={`Protein: ${total} of ${goal} grams`}>
      <svg width="40" height="40" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="40" className="ring-track" style={{ strokeWidth: 14 }} />
        {filled > 0 && <circle cx="50" cy="50" r="40" className="ring-fill" style={{ strokeWidth: 14 }} strokeDasharray={`${filled.toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 50 50)" />}
      </svg>
      <span>
        <span className="num tile-num">{total}<span className="tile-of"> g</span></span>
        <span className="cap">{total >= goal ? 'goal hit' : `of ${goal} g`}</span>
      </span>
    </Tile>
  )
}

// Calories eaten (graphite meter against the target, if set) and the estimated calories burnt.
// Cardio vs lifting split of the burnt estimate is on the Week page.
export function KcalTile({ date, onOpen }: TileProps) {
  const store = useStore()
  const eaten = kcalEatenOn(store, date).total
  const goal = kcalGoalFor(store, date)
  const burnt = kcalOn(store, date).total
  return (
    <Tile onOpen={onOpen} label={`${eaten} kilocalories eaten${goal ? ` of ${goal}` : ''}, about ${burnt} burnt`}>
      <span className="num tile-num">{eaten}</span>
      {goal && <span className="meter" aria-hidden="true"><span style={{ width: `${Math.min(eaten / goal, 1) * 100}%` }} /></span>}
      <span className="cap">{goal ? `of ${goal} kcal` : 'kcal eaten'}</span>
      <span className="cap">{burnt} burnt</span>
    </Tile>
  )
}

export function HabitsTile({ date, onOpen }: TileProps) {
  const store = useStore()
  const h = habitsOn(store, date)
  const logged = [h.sugar, h.junk_food].filter(Boolean).length
  const avoided = [h.sugar, h.junk_food].filter((x) => x === 'avoided').length
  // Today counts answers so far; a past day shows how many were avoided
  const n = onOpen ? logged : avoided
  return (
    <Tile onOpen={onOpen} label={onOpen ? `Habits: ${logged} of 2 logged` : `Habits: ${avoided} of 2 avoided`}>
      <span className="num tile-num habit-num">{n}<span className="tile-of">/2</span></span>
      <span className="cap">{onOpen ? 'habits' : 'avoided'}</span>
    </Tile>
  )
}
