import type { ProteinEntry } from '../data/types'

// Meals for "Repeat a meal" (TF-59): food entries logged close together on one day count as one meal.
// Pure functions, tested in tests/food.test.ts.

export const MEAL_GAP_MIN = 45   // entries within 45 minutes of the previous one belong to the same meal
export const MIN_ITEMS = 2       // a single food is already one tap away as a saved food

export type Meal = { key: string; name: string; date: string; entries: ProteinEntry[]; grams: number; kcal: number | null }

// Named by when it started (local time): before 11 breakfast, before 4 pm lunch, before 7 pm snack, else dinner
export function mealName(iso: string): string {
  const h = new Date(iso).getHours()
  return h >= 4 && h < 11 ? 'Breakfast' : h >= 11 && h < 16 ? 'Lunch' : h >= 16 && h < 19 ? 'Snack' : 'Dinner'
}

// What makes two meals "the same": the same foods in the same amounts
const signature = (entries: ProteinEntry[]) => entries
  .map((e) => `${e.food_id ?? (e.label ?? '').toLowerCase()}×${e.portion_label ?? ''}×${e.portion_qty ?? e.portion_grams ?? e.grams}`)
  .sort().join('|')

export function groupMeals(entries: ProteinEntry[]): Meal[] {
  const sorted = [...entries].sort((a, b) => a.logged_at.localeCompare(b.logged_at))
  const meals: ProteinEntry[][] = []
  for (const e of sorted) {
    const last = meals[meals.length - 1]
    const prev = last?.[last.length - 1]
    if (prev && prev.local_date === e.local_date && Date.parse(e.logged_at) - Date.parse(prev.logged_at) <= MEAL_GAP_MIN * 60_000) last.push(e)
    else meals.push([e])
  }
  return meals.map((m) => ({
    key: m[0].id,
    name: mealName(m[0].logged_at),
    date: m[0].local_date,
    entries: m,
    grams: m.reduce((n, e) => n + e.grams, 0),
    kcal: m.every((e) => e.kcal == null) ? null : m.reduce((n, e) => n + (e.kcal ?? 0), 0),
  }))
}

// Recent meals worth repeating: 2+ foods, newest first, one per distinct set of foods
export function recentMeals(entries: ProteinEntry[], fromDate: string, limit = 6): Meal[] {
  const seen = new Set<string>()
  return groupMeals(entries.filter((e) => e.local_date >= fromDate))
    .filter((m) => m.entries.length >= MIN_ITEMS)
    .reverse()
    .filter((m) => { const s = signature(m.entries); if (seen.has(s)) return false; seen.add(s); return true })
    .slice(0, limit)
}

// "2 × 1 katori Dal, Roti, Sabzi" → a short line of what's in it
export const mealFoods = (m: Meal) => m.entries.map((e) => e.label ?? 'Protein').join(', ')
