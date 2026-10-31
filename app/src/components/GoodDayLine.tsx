import { GOOD_DAY_WINS, WIN_TEXT, winsOn, useStore } from '../data/store'

// A calm line under the day's tiles once it's a good day (2 or more wins), naming the wins
export default function GoodDayLine({ date }: { date: string }) {
  const store = useStore()
  const wins = winsOn(store, date)
  if (wins.length < GOOD_DAY_WINS) return null
  return (
    <p className="good-day">
      <b>Good day</b>
      {wins.map((w) => <span key={w} className={`win win-${w}`}>{WIN_TEXT[w]}</span>)}
    </p>
  )
}
