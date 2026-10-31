import { supabase } from './supabase'
import { localDate } from './dates'

// Missed food searches (TF-60): saved privately so the food list can grow from what people actually look for.
// Best effort: if there's no signal, the miss simply isn't recorded (it's a hint, not data anyone relies on).

export type MissOutcome = 'ai' | 'typed' | 'none'

export function recordMiss(query: string, outcome: MissOutcome, date = localDate()) {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)
  if (q.length < 3 || !navigator.onLine) return
  supabase.from('food_search_misses')
    .upsert({ query: q, local_date: date, outcome }, { onConflict: 'user_id,query,local_date', ignoreDuplicates: true })
    .then(() => {}, () => {})
}

export type MissSummary = { query: string; times: number; last: string; outcomes: MissOutcome[] }

// Your misses from the last 60 days, most frequent first
export async function loadMisses(): Promise<MissSummary[] | null> {
  const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)
  const { data, error } = await supabase.from('food_search_misses').select('query,local_date,outcome')
    .gte('local_date', since).order('local_date', { ascending: false }).limit(500)
  if (error) return null
  const by = new Map<string, MissSummary>()
  for (const r of data as { query: string; local_date: string; outcome: MissOutcome }[]) {
    const m = by.get(r.query) ?? { query: r.query, times: 0, last: r.local_date, outcomes: [] }
    m.times++
    if (!m.outcomes.includes(r.outcome)) m.outcomes.push(r.outcome)
    by.set(r.query, m)
  }
  return [...by.values()].sort((a, b) => b.times - a.times || b.last.localeCompare(a.last))
}
