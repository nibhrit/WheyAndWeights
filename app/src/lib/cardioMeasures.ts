import type { Cardio, CardioKind, CardioMeasures, Effort } from '../data/types'

// What each cardio type is measured in (TF-74). Pure functions, tested in tests/food.test.ts.
export type Measure = 'minutes' | 'skips' | 'rounds'
export const measureOf = (k: CardioKind): Measure => (k === 'skipping' ? 'skips' : k === 'hiit' || k === 'circuit' ? 'rounds' : 'minutes')

// Skipping pace by effort (skips a minute), to turn a skip count into time when minutes aren't given
export const SKIPS_PER_MIN: Record<Effort, number> = { easy: 80, moderate: 110, hard: 140 }

export const minutesFromSkips = (skips: number, effort: Effort) => Math.max(1, Math.round(skips / SKIPS_PER_MIN[effort]))
export const minutesFromRounds = (rounds: number, work_s: number, rest_s: number) => Math.max(1, Math.round((rounds * (work_s + rest_s)) / 60))

// Starting values for the rounds form
export const ROUND_DEFAULTS: Record<'hiit' | 'circuit', { rounds: number; work_s: number; rest_s: number }> = {
  hiit: { rounds: 8, work_s: 40, rest_s: 20 },
  circuit: { rounds: 3, work_s: 300, rest_s: 60 },
}

const secs = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} s`)

// "500 skips" · "8 × 40 s on / 20 s off" · "30 min"
export function measureText(c: Pick<Cardio, 'minutes'> & CardioMeasures): string {
  if (c.skips) return `${c.skips.toLocaleString('en-IN')} skips`
  if (c.rounds && c.work_s != null && c.rest_s != null) return `${c.rounds} × ${secs(c.work_s)} on${c.rest_s ? ` / ${secs(c.rest_s)} off` : ''}`
  return `${c.minutes} min`
}

// The form's text boxes → minutes plus measures, or a message to show
export type MeasureInput = { minutes: string; skips: string; rounds: string; work_s: string; rest_s: string }
// For a new entry (c missing) or editing one. Skipping minutes are shown only if they were typed, i.e. differ from the
// estimate from skips; otherwise they stay empty and are worked out again on save.
export const formInput = (kind: CardioKind, c?: Pick<Cardio, 'minutes' | 'effort'> & CardioMeasures): MeasureInput => {
  const d = kind === 'hiit' || kind === 'circuit' ? ROUND_DEFAULTS[kind] : null
  const str = (v: number | null | undefined, fallback?: number) => (v != null ? String(v) : fallback != null ? String(fallback) : '')
  const typedSkipMin = !!c?.skips && c.minutes !== minutesFromSkips(c.skips, c.effort)
  return {
    minutes: c && (measureOf(kind) === 'minutes' || typedSkipMin) ? str(c.minutes) : '',
    skips: str(c?.skips), rounds: str(c?.rounds, d?.rounds), work_s: str(c?.work_s, d?.work_s), rest_s: str(c?.rest_s, d?.rest_s),
  }
}
const toInt = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN)

export function resolveCardio(kind: CardioKind, effort: Effort, v: MeasureInput): { minutes: number; measures: CardioMeasures } | { error: string } {
  const none = { skips: null, rounds: null, work_s: null, rest_s: null }
  const typedMin = v.minutes.trim() ? toInt(v.minutes) : null
  if (typedMin != null && !(typedMin >= 1 && typedMin <= 600)) return { error: 'Enter minutes between 1 and 600.' }
  const m = measureOf(kind)
  if (m === 'skips') {
    const skips = toInt(v.skips)
    if (!(skips >= 1 && skips <= 100000)) return { error: 'Enter the number of skips, e.g. 500.' }
    return { minutes: typedMin ?? Math.min(600, minutesFromSkips(skips, effort)), measures: { ...none, skips } }
  }
  if (m === 'rounds') {
    const rounds = toInt(v.rounds), work_s = toInt(v.work_s), rest_s = toInt(v.rest_s)
    if (!(rounds >= 1 && rounds <= 200)) return { error: 'Enter rounds between 1 and 200.' }
    if (!(work_s >= 5 && work_s <= 3600)) return { error: 'Enter work time in seconds (5 to 3600).' }
    if (!(rest_s >= 0 && rest_s <= 3600)) return { error: 'Enter rest time in seconds (0 to 3600).' }
    const minutes = minutesFromRounds(rounds, work_s, rest_s)
    if (minutes > 600) return { error: 'That adds up to more than 10 hours. Check the numbers.' }
    return { minutes, measures: { ...none, rounds, work_s, rest_s } }
  }
  if (typedMin == null) return { error: 'Enter minutes between 1 and 600.' }
  return { minutes: typedMin, measures: none }
}
