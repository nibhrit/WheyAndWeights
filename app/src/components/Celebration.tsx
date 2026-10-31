import { useEffect, useState } from 'react'
import { GOOD_DAY_WINS, WIN_TEXT, winsOn, useStore, type Win } from '../data/store'
import { localDate } from '../lib/dates'

const seenKey = (userId: string, date: string) => `ww:good-day:${userId}:${date}`
const seen = (key: string) => { try { return !!localStorage.getItem(key) } catch { return false } }

// A short celebration the moment a log makes today a good day (the 2nd win).
// Once per day per device; never on opening the app or on reload, only in response to something just logged.
export default function Celebration({ userId }: { userId: string }) {
  const store = useStore()
  const today = localDate()
  const count = store.loaded ? winsOn(store, today).length : null
  const [prev, setPrev] = useState<{ date: string; count: number | null }>({ date: today, count })
  const [shown, setShown] = useState<{ wins: Win[]; key: string } | null>(null)

  // Compare with the last count seen today; the first count (app opened, data loaded) is only a baseline
  if (prev.date !== today || prev.count !== count) {
    setPrev({ date: today, count })
    const key = seenKey(userId, today)
    if (prev.date === today && prev.count != null && count != null
      && prev.count < GOOD_DAY_WINS && count >= GOOD_DAY_WINS && !seen(key)) {
      setShown({ wins: winsOn(store, today), key })
    }
  }

  useEffect(() => {
    if (!shown) return
    try { localStorage.setItem(shown.key, '1') } catch { /* storage blocked: may show again on this device */ }
    const t = setTimeout(() => setShown(null), 4500)
    return () => clearTimeout(t)
  }, [shown])

  if (!shown) return null
  return (
    <button className="celebrate" role="status" aria-label="Good day. Tap to close" onClick={() => setShown(null)}>
      <svg className="celebrate-mark" viewBox="0 0 48 48" aria-hidden="true">
        <circle className="c-ring" cx="24" cy="24" r="20" />
        <path className="c-check" d="M15 25l6 6 12-13" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} className="c-ray" x1="24" y1="1" x2="24" y2="-4" transform={`rotate(${a} 24 24)`} />
        ))}
      </svg>
      <span className="celebrate-text">
        <b>Good day!</b>
        <span className="celebrate-wins">
          {shown.wins.map((w) => <span key={w} className={`win win-${w}`}>{WIN_TEXT[w]}</span>)}
        </span>
      </span>
    </button>
  )
}
