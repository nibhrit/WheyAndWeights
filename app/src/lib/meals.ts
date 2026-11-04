import type { Meal, ProteinEntry } from '../data/types'

// Meals (TF-63): every food entry belongs to Breakfast, Lunch, Snacks or Dinner, whenever it was logged.
// Pure functions, tested in tests/food.test.ts.

export const MEALS: [Meal, string][] = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['snacks', 'Snacks'], ['dinner', 'Dinner']]
export const mealName = (m: Meal) => MEALS.find(([id]) => id === m)![1]

// The meal a time of day suggests: before 11 breakfast, before 4 pm lunch, before 7 pm snacks, else dinner
export function mealAt(d = new Date()): Meal {
  const h = d.getHours()
  return h >= 4 && h < 11 ? 'breakfast' : h >= 11 && h < 16 ? 'lunch' : h >= 16 && h < 19 ? 'snacks' : 'dinner'
}

// An entry's meal; entries from before meals existed get the one their time suggests
export const mealOf = (e: Pick<ProteinEntry, 'meal' | 'logged_at'>): Meal => e.meal ?? mealAt(new Date(e.logged_at))

export type MealGroup = { key: string; meal: Meal; name: string; date: string; entries: ProteinEntry[]; grams: number; kcal: number | null }

const order = (m: Meal) => MEALS.findIndex(([id]) => id === m)

export function groupMeals(entries: ProteinEntry[]): MealGroup[] {
  const by = new Map<string, ProteinEntry[]>()
  for (const e of [...entries].sort((a, b) => a.logged_at.localeCompare(b.logged_at))) {
    const k = `${e.local_date}|${mealOf(e)}`
    by.set(k, [...(by.get(k) ?? []), e])
  }
  return [...by.entries()].map(([k, list]) => {
    const meal = mealOf(list[0])
    return {
      key: k, meal, name: mealName(meal), date: list[0].local_date, entries: list,
      grams: list.reduce((n, e) => n + e.grams, 0),
      kcal: list.every((e) => e.kcal == null) ? null : list.reduce((n, e) => n + (e.kcal ?? 0), 0),
    }
  }).sort((a, b) => a.date.localeCompare(b.date) || order(a.meal) - order(b.meal))
}

// One food, however often it was logged: its food id, or its name for typed foods and AI estimates without one
const itemKey = (e: ProteinEntry) =>
  e.food_id && e.food_id !== 'ai:estimate' ? e.food_id : `name:${(e.label ?? '').trim().toLowerCase()}`

export type PastItem = { key: string; entry: ProteinEntry; count: number }

// Foods you've had at this meal before (TF-68, replaces whole-meal repeat): one per food, most often first, then most
// recent, each with the portion you had last time (`entry`, the newest). From `fromDate` on; foods already logged to
// this meal on `day` are left out (one tap logs, so the list shows what's still to add). Unnamed typed entries are skipped.
export function pastItems(entries: ProteinEntry[], meal: Meal, day: string, fromDate: string): PastItem[] {
  const mine = entries.filter((e) => mealOf(e) === meal)
  const already = new Set(mine.filter((e) => e.local_date === day).map(itemKey))
  const by = new Map<string, PastItem>()
  for (const e of mine) {
    if (e.local_date < fromDate || (!e.food_id && !e.label?.trim())) continue
    const k = itemKey(e)
    if (already.has(k)) continue
    const p = by.get(k)
    if (!p) by.set(k, { key: k, entry: e, count: 1 })
    else { p.count++; if (e.logged_at > p.entry.logged_at) p.entry = e }
  }
  return [...by.values()].sort((a, b) => b.count - a.count || b.entry.logged_at.localeCompare(a.entry.logged_at))
}
