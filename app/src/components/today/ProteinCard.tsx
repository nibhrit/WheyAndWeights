import { goalFor, proteinTotal, useStore } from '../../data/store'
import { trendDays } from '../../lib/dayContext'
import MiniBars from './MiniBars'

// Today's protein, big (TF-66): ring + eaten / goal, then the week's trend against the goal
export default function ProteinCard({ date, onOpen }: { date: string; onOpen: () => void }) {
  const store = useStore()
  const total = proteinTotal(store, date)
  const goal = goalFor(store, date)
  const C = 2 * Math.PI * 42
  const filled = Math.min(total / goal, 1) * C
  const days = trendDays(date)
  const week = days.map((d) => (store.protein.some((e) => e.local_date === d) ? proteinTotal(store, d) : null))
  const logged = week.filter((v): v is number => v != null)
  const avg = logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : null
  const hit = days.filter((d, i) => week[i] != null && week[i]! >= goalFor(store, d)).length

  return (
    <div className="card metric" role="group" aria-label="Protein">
      <button className="metric-main" onClick={onOpen} aria-label={`Protein ${total} of ${goal} grams. Open Food`}>
        <svg className="ring big-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="42" className="ring-track" />
          {filled > 0 && <circle cx="50" cy="50" r="42" className="ring-fill" strokeDasharray={`${filled.toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 50 50)" />}
        </svg>
        <span className="metric-nums">
          <span className="cap">Protein</span>
          <span><span className="num metric-big">{total}</span><span className="metric-of"> / {goal} g</span></span>
          <span className="cap">{total >= goal ? 'Goal hit' : `${goal - total} g to go`}</span>
        </span>
      </button>
      <div className="metric-trend">
        <MiniBars days={days} values={week} goal={goal} tone="protein" label={`Protein per day, goal ${goal} g. Tap a day to open it`}
          describe={(v) => (v == null ? 'nothing logged' : `${v} g protein`)} />
        <span className="cap">{avg == null ? 'Nothing logged these 7 days' : `7-day avg ${avg} g · goal hit ${hit}/7`}</span>
      </div>
    </div>
  )
}
