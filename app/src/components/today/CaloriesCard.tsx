import { kcalEatenOn, kcalGoalFor, kcalOn, netDeficitOn, useStore } from '../../data/store'
import { trendDays } from '../../lib/dayContext'
import MiniBars from './MiniBars'

const fmt = (n: number) => Math.abs(n).toLocaleString('en-IN')

// Calories, big (TF-66): net deficit = (target − eaten) + burnt, then eaten / target and burnt, then the week
export default function CaloriesCard({ date, onOpen, onSetTarget }: { date: string; onOpen: () => void; onSetTarget: () => void }) {
  const store = useStore()
  const eaten = kcalEatenOn(store, date).total
  const target = kcalGoalFor(store, date)
  const burnt = kcalOn(store, date).total
  const net = netDeficitOn(store, date)
  const days = trendDays(date)
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
          <MiniBars days={days} values={week} tone="graphite" label="Net calorie deficit per day. Tap a day to open it"
            describe={(v) => (v == null ? 'no food logged' : `${fmt(v)} kcal net ${v >= 0 ? 'deficit' : 'surplus'}`)} />
          <span className="cap">{week.every((v) => v == null) ? 'No days with food logged these 7 days' : `7 days: ${fmt(total)} kcal net ${total >= 0 ? 'deficit' : 'surplus'}`}</span>
        </div>
      ) : (
        <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={onSetTarget}>Set a calorie target to see your net deficit</button>
      )}
    </div>
  )
}
