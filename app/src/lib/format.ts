import type { LiftSet, ProteinEntry } from '../data/types'

// 60 → "60", 62.5 → "62.5", 62.50 → "62.5"
export const fmtWeight = (n: number) => String(Math.round(n * 100) / 100)

// "60 60 65 kg" when all sets share a unit, else "20 kg 45 lb"
export function fmtSets(sets: LiftSet[]): string {
  if (!sets.length) return ''
  const same = sets.every((s) => s.unit === sets[0].unit)
  return same
    ? `${sets.map((s) => fmtWeight(s.weight)).join('  ')} ${sets[0].unit}`
    : sets.map((s) => `${fmtWeight(s.weight)} ${s.unit}`).join('  ')
}

// 08:30
export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

// "C 22 · F 7 · fibre 5 · sugar 3 g": only the macros the entry has
export function macroLine(e: ProteinEntry) {
  const parts = [
    e.carbs_g != null && `C ${e.carbs_g}`, e.fat_g != null && `F ${e.fat_g}`,
    e.fiber_g != null && `fibre ${e.fiber_g}`, e.added_sugar_g != null && `sugar ${e.added_sugar_g}`,
  ].filter(Boolean)
  return parts.length ? `${parts.join(' · ')} g` : null
}
