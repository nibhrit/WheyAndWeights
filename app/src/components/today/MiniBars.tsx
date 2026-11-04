import { fmtDate, fmtDay, localDate } from '../../lib/dates'
import { canOpen, useDay } from '../../lib/dayContext'

type Props = {
  days: string[]                 // oldest → newest
  values: (number | null)[]      // null = nothing logged
  goal?: number                  // dashed line
  tone: 'protein' | 'graphite' | 'habit'
  label: string                  // for screen readers
  describe: (v: number | null) => string   // one bar for screen readers, e.g. "84 g protein"
}

// Seven small bars for a week's trend (TF-66). Negative values (a calorie surplus) hang below a centre line.
// Each bar opens its day, like the day picker (TF-69); the day being shown is highlighted.
export default function MiniBars({ days, values, goal, tone, label, describe }: Props) {
  const { day, setDay } = useDay()
  const today = localDate()
  const nums = values.filter((v): v is number => v != null)
  const top = Math.max(goal ?? 0, ...nums.map(Math.abs), 1)
  const twoSided = nums.some((v) => v < 0)
  return (
    <div className={`minibars ${tone}${twoSided ? ' two' : ''}`} role="group" aria-label={label}>
      {/* the bars sit above a 16px row of day letters */}
      {goal != null && !twoSided && <span className="minibars-goal" style={{ bottom: `calc(16px + (100% - 16px) * ${goal / top})` }} />}
      {twoSided && <span className="minibars-zero" />}
      {days.map((d, i) => {
        const v = values[i]
        const h = v == null ? 0 : (Math.abs(v) / top) * (twoSided ? 50 : 100)
        return (
          <button
            key={d} type="button" className={`minibar${d === day ? ' now' : ''}`} disabled={!canOpen(d, today)}
            aria-pressed={d === day} aria-label={`${fmtDay(d)} ${fmtDate(d)}, ${describe(v)}`}
            onClick={() => setDay(d === today ? null : d)}
          >
            <span className={`minibar-fill${v != null && v < 0 ? ' neg' : ''}${v == null ? ' none' : ''}`} style={{ height: `${Math.max(h, v == null ? 0 : 3)}%` }} />
            <span className="minibar-day">{fmtDay(d).slice(0, 1)}</span>
          </button>
        )
      })}
    </div>
  )
}
