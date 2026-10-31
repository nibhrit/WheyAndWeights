import type { Food, Portion } from '../data/foods/schema'
import type { ProteinEntry } from '../data/types'

// Your own foods, rebuilt from what you've logged: AI estimates ("ai:…"), packs from Open Food Facts ("off:<barcode>")
// and numbers typed from a pack label ("label:<name>"). One food each (newest entry wins), using the numbers you saved
// (including edits), with the portion you used as its default. Searchable and usable offline.
const SOURCES: [prefix: string, source: string, confidence: Food['confidence']][] = [
  ['ai:', 'AI estimate', 'estimate'],
  ['off:', 'Open Food Facts', 'measured'],
  ['label:', 'Pack label', 'measured'],
]
const sourceOf = (id: string | null) => SOURCES.find(([prefix]) => id?.startsWith(prefix))

export const MY_SOURCES = new Set(SOURCES.map(([, s]) => s))
export const isMyFood = (f: Food) => MY_SOURCES.has(f.source.name)

export function myFoodsFrom(entries: ProteinEntry[]): Food[] {
  const sorted = [...entries].sort((a, b) => b.logged_at.localeCompare(a.logged_at))
  const seenId = new Set<string>()
  const seenName = new Set<string>()
  const out: Food[] = []
  for (const e of sorted) {
    const src = sourceOf(e.food_id)
    if (!src || !e.label || !e.portion_grams) continue
    // 'ai:estimate' (no cache id) is shared by different foods: give each its own id
    const id = e.food_id === 'ai:estimate' ? `ai:e-${e.id.slice(0, 8)}` : e.food_id!
    const name = e.label.trim().toLowerCase()
    if (seenId.has(id) || seenName.has(name)) continue
    seenId.add(id); seenName.add(name)
    const g = e.portion_grams
    const per = (v: number | null) => ((v ?? 0) * 100) / g
    // "2 × 1 bar (50 g)" → the portion is "1 bar (50 g)"; otherwise one serving = what was eaten
    const portion: Portion = e.portion_label && e.portion_qty
      ? { label: e.portion_label, grams: g / e.portion_qty, default: true }
      : { label: '1 serving', grams: g, default: true }
    out.push({
      id, name: e.label, aliases: [], category: 'basic',
      per100g: {
        kcal: per(e.kcal), protein_g: per(e.grams), carbs_g: per(e.carbs_g), fat_g: per(e.fat_g),
        fiber_g: e.fiber_g == null ? undefined : per(e.fiber_g),
        added_sugar_g: e.added_sugar_g == null ? undefined : per(e.added_sugar_g),
      },
      portions: [portion],
      source: { name: src[1] },
      confidence: src[2],
    })
  }
  return out
}
