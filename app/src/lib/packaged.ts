// Packaged foods from Open Food Facts (TF-38): turning a product record into a Food the app can log, with data checks.
// Pure functions only (tested in tests/food.test.ts); the network calls are in lib/off.ts.
//
// Licence: the Open Food Facts database is ODbL, its contents DbCL. We fetch products live and never copy them into
// foods.json; a logged entry keeps its own snapshot of the numbers, like every other food entry.

import type { Food, Portion } from '../data/foods/schema'
import type { FoodRef, Nutrients } from '../data/types'

export type OffProduct = {
  code?: string
  product_name?: string
  product_name_en?: string
  brands?: string | string[]
  serving_size?: string
  serving_quantity?: number | string
  serving_quantity_unit?: string
  product_quantity?: number | string
  product_quantity_unit?: string
  nutriments?: Record<string, number | string | undefined>
  countries_tags?: string[]
}

// Only what we read, to keep responses small
export const OFF_FIELDS = 'code,product_name,product_name_en,brands,serving_size,serving_quantity,serving_quantity_unit,' +
  'product_quantity,product_quantity_unit,nutriments,countries_tags'

export const OFF_SOURCE = 'Open Food Facts'
export const LABEL_SOURCE = 'Pack label'

// no_nutrition: protein or kcal missing → the label form opens instead
// partial:      carbs or fat missing → the label form opens, prefilled, so missing stays "unknown" rather than 0
// implausible:  impossible values (over 100 g of something per 100 g, over 950 kcal per 100 g)
// energy:       kcal far from 4·protein + 4·carbs + 9·fat (often a typo in the record)
export type Issue = 'no_name' | 'no_nutrition' | 'partial' | 'implausible' | 'energy'
export const ISSUE_TEXT: Record<Issue, string> = {
  no_name: 'This product has no name in Open Food Facts.',
  no_nutrition: 'Open Food Facts doesn’t have its protein and calories.',
  partial: 'Open Food Facts is missing its carbs or fat.',
  implausible: 'Some numbers look impossible.',
  energy: 'The calories don’t match the protein, carbs and fat.',
}

// food: ready to log (unknown nutrients as 0); per100: as printed, null = not in the record
export type Packaged = { code: string; food: Food; per100: ReturnType<typeof per100>; issues: Issue[]; india: boolean }
// These open the label form instead of the portion picker
export const needsLabel = (issues: Issue[]) => issues.includes('no_nutrition') || issues.includes('partial')

// GTIN barcodes (EAN-13, EAN-8, UPC-A 12, GTIN-14): digits with a valid check digit
export function validBarcode(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const fmt = (n: number) => String(Math.round(n * 10) / 10)

// "Amul" + "Protein Lassi - Plain" → "Amul Protein Lassi - Plain"; no double brand ("Muscleblaze Biozyme Whey")
export function productName(p: OffProduct): string | null {
  const name = clean(p.product_name_en || p.product_name || '')
  const brand = clean((Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0]) ?? '')
  if (!name) return brand || null
  if (!brand || name.toLowerCase().includes(brand.toLowerCase())) return name
  return `${brand.charAt(0).toUpperCase()}${brand.slice(1)} ${name}`
}

// Nutrients per 100 g (or ml) as printed; kcal from kJ when only kJ is given
export function per100(p: OffProduct) {
  const n = p.nutriments ?? {}
  const kj = num(n['energy_100g'])
  return {
    kcal: num(n['energy-kcal_100g']) ?? (kj != null ? kj / 4.184 : null),
    protein_g: num(n['proteins_100g']),
    carbs_g: num(n['carbohydrates_100g']),
    fat_g: num(n['fat_100g']),
    fiber_g: num(n['fiber_100g']),
    added_sugar_g: num(n['added-sugars_100g']),
  }
}
type Per100 = ReturnType<typeof per100>

export function checkNumbers(v: Per100): Issue[] {
  if (v.kcal == null || v.protein_g == null) return ['no_nutrition']
  const issues: Issue[] = []
  if (v.carbs_g == null || v.fat_g == null) issues.push('partial')
  const grams = [v.protein_g, v.carbs_g, v.fat_g, v.fiber_g, v.added_sugar_g].filter((x): x is number => x != null)
  if (grams.some((x) => x < 0 || x > 100) || v.kcal < 0 || v.kcal > 950
    || v.protein_g + (v.carbs_g ?? 0) + (v.fat_g ?? 0) > 105) issues.push('implausible')
  if (v.carbs_g != null && v.fat_g != null) {
    const est = 4 * v.protein_g + 4 * v.carbs_g + 9 * v.fat_g
    if (Math.abs(v.kcal - est) > Math.max(30, 0.25 * Math.max(v.kcal, est))) issues.push('energy')
  }
  return issues
}

const unitOf = (u?: string) => (u?.toLowerCase() === 'ml' ? 'ml' : u == null || u.toLowerCase() === 'g' ? 'g' : null)
const MAX_PACK = 600 // a 1.75 kg tub of whey isn't a portion

// Household-style portions from the pack: the serving as printed, and the whole pack when it's a sensible amount
export function packPortions(p: OffProduct): Portion[] {
  const out: Portion[] = []
  const sq = num(p.serving_quantity)
  const su = unitOf(p.serving_quantity_unit)
  if (sq && sq > 0 && sq <= 2000 && su) {
    const printed = clean(p.serving_size ?? '').replace(/\bportion\b/i, 'serving')
    // Keep the printed name when it's "1 <thing> (<amount>)", e.g. "1 bar (50 g)"; otherwise "1 serving (38.5 g)"
    // (the database keeps portion names to 40 characters)
    const label = /^1 [a-z][a-z ]{0,20}\(/i.test(printed) && printed.length <= 40 ? printed : `1 serving (${fmt(sq)} ${su})`
    out.push({ label, grams: sq, default: true })
  }
  const pq = num(p.product_quantity)
  const pu = unitOf(p.product_quantity_unit)
  if (pq && pq > 0 && pq <= MAX_PACK && pu && pq !== sq) {
    out.push({ label: `1 pack (${fmt(pq)} ${pu})`, grams: pq, default: !out.length })
  }
  return out
}

// An Open Food Facts product as a Food (id "off:<barcode>"), plus what's wrong with it, if anything
export function fromOff(p: OffProduct, codeIn?: string): Packaged {
  const code = String(p.code ?? codeIn ?? '')
  const name = productName(p)
  const v = per100(p)
  const issues = checkNumbers(v)
  if (!name) issues.unshift('no_name')
  const liquid = unitOf(p.serving_quantity_unit) === 'ml' || unitOf(p.product_quantity_unit) === 'ml'
  const food: Food = {
    id: `off:${code}`,
    name: name ?? `Product ${code}`,
    aliases: [],
    category: 'basic',
    per100g: {
      kcal: v.kcal ?? 0, protein_g: v.protein_g ?? 0, carbs_g: v.carbs_g ?? 0, fat_g: v.fat_g ?? 0,
      ...(v.fiber_g != null && { fiber_g: v.fiber_g }), ...(v.added_sugar_g != null && { added_sugar_g: v.added_sugar_g }),
    },
    portions: packPortions(p),
    source: { name: OFF_SOURCE, ref: code, url: `https://world.openfoodfacts.org/product/${code}` },
    confidence: 'measured',
    ...(liquid && { notes: 'Values per 100 ml; ml counted as grams.' }),
  }
  return { code, food, per100: v, issues, india: !!p.countries_tags?.includes('en:india') }
}

// Search results worth showing: has protein and kcal; records with no warnings first, then products sold in India
export function rankPackaged(list: Packaged[]): Packaged[] {
  return list
    .filter((x) => !x.issues.includes('no_nutrition'))   // partial ones stay: protein and kcal are there
    .map((x, i) => ({ x, i }))
    .sort((a, b) => Number(a.x.issues.length > 0) - Number(b.x.issues.length > 0) || Number(b.x.india) - Number(a.x.india) || a.i - b.i)
    .map(({ x }) => x)
}

// ---------- The label form: numbers typed from the pack ----------

export type LabelInput = {
  name: string
  code: string | null          // barcode, when the form came from a scan
  basis: 'per100' | 'serving'  // what the label's numbers are for
  servingGrams: number | null  // size of one serving (basis "serving"; optional for per100)
  values: Nutrients            // as printed, for the basis; null = not on the label
  amount: number               // how much was eaten: servings when unit is "serving", else grams
  unit: 'serving' | 'g'
}

export const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item'

// The entry to log: nutrients for what was eaten + a food reference so it's searchable next time
export function labelEntry(i: LabelInput): { n: Nutrients; ref: FoodRef } | { error: string } {
  if (!i.name.trim()) return { error: 'Give it a name, e.g. “Yoga Bar protein bar”.' }
  if (i.values.grams == null && i.values.kcal == null) return { error: 'Enter at least protein or calories.' }
  const sg = i.servingGrams
  if (i.basis === 'serving' && !(sg && sg > 0 && sg <= 2000)) return { error: 'Enter the serving size in grams (on the label).' }
  if (i.unit === 'serving' && !(sg && sg > 0)) return { error: 'Enter the serving size, or say how many grams you had.' }
  if (!(i.amount > 0 && i.amount <= (i.unit === 'serving' ? 20 : 2000))) return { error: i.unit === 'serving' ? 'Enter how many servings, up to 20.' : 'Enter grams, up to 2000.' }
  const eatenGrams = i.unit === 'serving' ? i.amount * sg! : i.amount
  const baseGrams = i.basis === 'serving' ? sg! : 100
  const scale = eatenGrams / baseGrams
  const r = (v: number | null) => (v == null ? null : Math.round(v * scale))
  const n: Nutrients = {
    grams: r(i.values.grams) ?? 0, kcal: r(i.values.kcal), carbs_g: r(i.values.carbs_g), fat_g: r(i.values.fat_g),
    fiber_g: r(i.values.fiber_g), added_sugar_g: r(i.values.added_sugar_g),
  }
  if (n.grams > 1000 || (n.kcal ?? 0) > 5000) return { error: 'That’s more than one meal. Check the amount.' }
  const ref: FoodRef = {
    food_id: i.code ? `off:${i.code}` : `label:${slug(i.name)}`,
    portion_label: i.unit === 'serving' ? `1 serving (${fmt(sg!)} g)` : null,
    portion_qty: i.unit === 'serving' ? i.amount : null,
    portion_grams: Math.round(eatenGrams * 10) / 10,
  }
  return { n, ref }
}
