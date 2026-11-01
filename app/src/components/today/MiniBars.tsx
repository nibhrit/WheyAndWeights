import { fmtDay } from '../../lib/dates'

type Props = {
  days: string[]                 // oldest → newest (the last one is the day being viewed)
  values: (number | null)[]      // null = nothing logged
  goal?: number                  // dashed line
  tone: 'protein' | 'graphite' | 'habit'
  label: string                  // for screen readers
}

// Seven small bars for a week's trend (TF-66). Negative values (a calorie surplus) hang below a centre line.
export default function MiniBars({ days, values, goal, tone, label }: Props) {
  const nums = values.filter((v): v is number => v != null)
  const top = Math.max(goal ?? 0, ...nums.map(Math.abs), 1)
  const twoSided = nums.some((v) => v < 0)
  return (
    <div className={`minibars ${tone}${twoSided ? ' two' : ''}`} role="img" aria-label={label}>
      {/* the bars sit above a 16px row of day letters */}
      {goal != null && !twoSided && <span className="minibars-goal" style={{ bottom: `calc(16px + (100% - 16px) * ${goal / top})` }} />}
      {twoSided && <span className="minibars-zero" />}
      {days.map((d, i) => {
        const v = values[i]
        const h = v == null ? 0 : (Math.abs(v) / top) * (twoSided ? 50 : 100)
        return (
          <span key={d} className={`minibar${i === days.length - 1 ? ' now' : ''}`}>
            <span className={`minibar-fill${v != null && v < 0 ? ' neg' : ''}${v == null ? ' none' : ''}`} style={{ height: `${Math.max(h, v == null ? 0 : 3)}%` }} />
            <span className="minibar-day">{fmtDay(d).slice(0, 1)}</span>
          </span>
        )
      })}
    </div>
  )
}
