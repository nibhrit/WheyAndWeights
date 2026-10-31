import type { Food } from '../data/foods/schema'
import type { ProteinEntry } from '../data/types'

const isAi = (id: string | null) => !!id?.startsWith('ai:')

// Foods you've logged from an AI estimate, turned back into searchable foods: one per food (newest wins),
// with "1 serving" = the amount you logged and the numbers you saved (including any edits).
export function aiFoodsFrom(entries: ProteinEntry[]): Food[] {
  const sorted = [...entries].sort((a, b) => b.logged_at.localeCompare(a.logged_at))
  const seenId = new Set<string>()
  const seenName = new Set<string>()
  const out: Food[] = []
  for (const e of sorted) {
    if (!isAi(e.food_id) || !e.label || !e.portion_grams) continue
    // 'ai:estimate' (no cache id) is shared by different foods: give each its own id
    const id = e.food_id === 'ai:estimate' ? `ai:e-${e.id.slice(0, 8)}` : e.food_id!
    const name = e.label.trim().toLowerCase()
    if (seenId.has(id) || seenName.has(name)) continue
    seenId.add(id); seenName.add(name)
    const g = e.portion_grams
    const per = (v: number | null) => ((v ?? 0) * 100) / g
    out.push({
      id, name: e.label, aliases: [], category: 'restaurant',
      per100g: {
        kcal: per(e.kcal), protein_g: per(e.grams), carbs_g: per(e.carbs_g), fat_g: per(e.fat_g),
        fiber_g: e.fiber_g == null ? undefined : per(e.fiber_g),
        added_sugar_g: e.added_sugar_g == null ? undefined : per(e.added_sugar_g),
      },
      portions: [{ label: '1 serving', grams: g, default: true }],
      source: { name: 'AI estimate' },
      confidence: 'estimate',
    })
  }
  return out
}
