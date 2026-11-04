import { createContext, useContext } from 'react'
import { addDays, fmtDate, fmtDay, localDate } from './dates'

// The day the app is showing and logging to: today, or a past day picked from Today's date (up to LOOK_BACK days back).
// Lift, Food, Cardio and Today all follow it; App shows a banner on every tab while it's a past day.
export const LOOK_BACK = 7

export type DayValue = { day: string; setDay: (d: string | null) => void }
export const DayContext = createContext<DayValue>({ day: localDate(), setDay: () => {} })

// A picked day only counts while it's in range; null (or anything stale) means today
export function activeDay(picked: string | null, today = localDate()) {
  return picked && picked < today && picked >= addDays(today, -LOOK_BACK) ? picked : today
}

// Days you can open (today and the last LOOK_BACK days), e.g. by tapping a chart bar (TF-69)
export const canOpen = (d: string, today = localDate()) => d <= today && d >= addDays(today, -LOOK_BACK)

// The 7 days Today's trends show: the week ending today, so tapping a bar opens that day without the chart moving.
// Only a day further back than that (7 days ago) shows the week starting on it.
export function trendDays(day: string, today = localDate()) {
  const end = addDays(day, 6) < today ? addDays(day, 6) : today
  return Array.from({ length: 7 }, (_, i) => addDays(end, i - 6))
}

export const dayLabel = (d: string, today = localDate()) =>
  d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : `${fmtDay(d)} ${fmtDate(d)}`

export function useDay() {
  const { day, setDay } = useContext(DayContext)
  const isToday = day === localDate()
  return { day, setDay, isToday, label: dayLabel(day) }
}
