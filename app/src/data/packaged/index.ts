// Packaged foods sold in India (TF-57), from Open Food Facts (ODbL; see LICENSE.md here), built by build-packaged.mjs.
// Imported lazily (see lib/usePackaged.ts) so it isn't part of what loads when the app opens; precached for offline.

import type { Food } from '../foods/schema'
import { OFF_SOURCE } from '../../lib/packaged'
import { buildIndex } from '../../lib/foodSearch'

type Row = [code: string, name: string, brand: string | null, kcal: number, p: number, c: number, f: number,
  fib: number | null, sugar: number | null, portions: [string, number][], liquid: 0 | 1]
type File = { version: string; generated: string; products: Row[] }

const file = (import.meta.glob<File>('./packaged-in.json', { eager: true, import: 'default' })['./packaged-in.json']
  ?? { version: 'none', generated: '', products: [] }) as File

export const version = file.version

export const foods: Food[] = file.products.map(([code, name, brand, kcal, p, c, f, fib, sugar, portions, liquid]) => ({
  id: `off:${code}`,
  name,
  aliases: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? [brand] : [],
  category: 'basic',
  per100g: { kcal, protein_g: p, carbs_g: c, fat_g: f, ...(fib != null && { fiber_g: fib }), ...(sugar != null && { added_sugar_g: sugar }) },
  portions: portions.map(([label, grams], i) => ({ label, grams, ...(i === 0 && { default: true }) })),
  source: { name: OFF_SOURCE, ref: code, url: `https://world.openfoodfacts.org/product/${code}` },
  confidence: 'measured',
  ...(liquid ? { notes: 'Values per 100 ml; ml counted as grams.' } : {}),
}))

const brands = new Map(file.products.map((r) => [`off:${r[0]}`, r[2]]))
export const brandOf = (id: string) => brands.get(id) ?? null

export const index = buildIndex(foods)
const byId = new Map(foods.map((f) => [f.id, f]))
export const packagedById = (id: string | null) => (id ? byId.get(id) : undefined)
