import { kcalEatenOn, kcalGoalFor, kcalOn, netDeficitOn, useStore } from '../../data/store'
import { addDays } from '../../lib/dates'
import MiniBars from './MiniBars'

const fmt = (n: number) => Math.abs(n).toLocaleString('en-IN')

// Calories, big (TF-66): net deficit = (target − eaten) + burnt, then eaten / target and burnt, then the week
export default function CaloriesCard({ date, onOpen, onSetTarget }: { date: string; onOpen: () => void; onSetTarget: () => void }) {
  const store = useStore()
  const eaten = kcalEatenOn(store, date).total
  const target = kcalGoalFor(store, date)
  const burnt = kcalOn(store, date).total
  const net = netDeficitOn(store, date)
  const days = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6))
  const week = days.map((d) => netDeficitOn(store, d))
  const total = week.reduce<number>((a, b) => a + (b ?? 0), 0)

  return (
    <div className="card metric" role="group" aria-label="Calories">
      <button className="metric-main kcal-main" onClick={onOpen} aria-label="Open Food">
        <span className="metric-nums">
          <span className="cap">{net == null ? 'Calories eaten' : net >= 0 ? 'Net calorie deficit' : 'Net calorie surplus'}</span>
          <span><span className="num metric-big">{net == null ? fmt(eaten) : fmt(net)}</span><span className="metric-of"> kcal</span></span>
          <span className="cap">
            {target ? `Eaten ${fmt(eaten)} of ${fmt(target)}` : `Eaten ${fmt(eaten)}`} · burnt about {fmt(burnt)}
          </span>
        </span>
      </button>
      {target ? (
        <div className="metric-trend">
          <MiniBars days={days} values={week} tone="graphite" label="Net calorie deficit this week" />
          <span className="cap">{week.every((v) => v == null) ? 'No days with food logged this week' : `This week: ${fmt(total)} kcal net ${total >= 0 ? 'deficit' : 'surplus'}`}</span>
        </div>
      ) : (
        <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={onSetTarget}>Set a calorie target to see your net deficit</button>
      )}
    </div>
  )
}
