import type { Meal, ProteinEntry } from '../data/types'

// Meals for "Repeat a meal" (TF-59, TF-63): a meal is the foods logged to one meal (Breakfast, Lunch, Snacks,
// Dinner) on one day, whenever they were logged. Pure functions, tested in tests/food.test.ts.

export const MEALS: [Meal, string][] = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['snacks', 'Snacks'], ['dinner', 'Dinner']]
export const mealName = (m: Meal) => MEALS.find(([id]) => id === m)![1]

// The meal a time of day suggests: before 11 breakfast, before 4 pm lunch, before 7 pm snacks, else dinner
export function mealAt(d = new Date()): Meal {
  const h = d.getHours()
  return h >= 4 && h < 11 ? 'breakfast' : h >= 11 && h < 16 ? 'lunch' : h >= 16 && h < 19 ? 'snacks' : 'dinner'
}

// An entry's meal; entries from before meals existed get the one their time suggests
export const mealOf = (e: Pick<ProteinEntry, 'meal' | 'logged_at'>): Meal => e.meal ?? mealAt(new Date(e.logged_at))

export const MIN_ITEMS = 2   // a single food is already one tap away as a saved food

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

// What makes two meals "the same": the same foods in the same amounts
const signature = (entries: ProteinEntry[]) => entries
  .map((e) => `${e.food_id ?? (e.label ?? '').toLowerCase()}×${e.portion_label ?? ''}×${e.portion_qty ?? e.portion_grams ?? e.grams}`)
  .sort().join('|')

// Recent meals worth repeating: 2+ foods, newest first, one per distinct set of foods
export function recentMeals(entries: ProteinEntry[], fromDate: string, limit = 6): MealGroup[] {
  const seen = new Set<string>()
  return groupMeals(entries.filter((e) => e.local_date >= fromDate))
    .filter((m) => m.entries.length >= MIN_ITEMS)
    .reverse()
    .filter((m) => { const s = signature(m.entries); if (seen.has(s)) return false; seen.add(s); return true })
    .slice(0, limit)
}

export const mealFoods = (m: MealGroup) => m.entries.map((e) => e.label ?? 'Protein').join(', ')
