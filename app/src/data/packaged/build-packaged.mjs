// Builds packaged-in.json: packaged foods sold in India, from Open Food Facts, for the app's one search box (TF-57).
// Run (streams ~1.5 GB; a few minutes on a good connection):
//   node --experimental-strip-types app/src/data/packaged/build-packaged.mjs
// Refresh monthly. Data: Open Food Facts (https://world.openfoodfacts.org), Open Database License (ODbL);
// contents under the Database Contents License (DbCL). This file is a separate database under ODbL (see LICENSE.md
// here) and is never mixed into foods.json (USDA, CC0).
//
// Each product is cleaned with the same checks as a barcode scan (app/src/lib/packaged.ts): products missing
// protein, kcal, carbs or fat, with impossible values, or whose calories don't match their macros are left out.

import { createReadStream, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { fromOff } from '../../lib/packaged.ts'

// Open Food Facts' daily full export (tab-separated, ~1.5 GB compressed). Their recommended way to get many products,
// rather than paging through the search API. Streamed: never stored on disk or held in memory whole.
const EXPORT = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz'
const UA = 'WheyAndWeights/1.0 (https://github.com/nibhrit/WheyAndWeights)'
const COLS = ['code', 'product_name', 'brands', 'countries_tags', 'quantity', 'serving_size', 'serving_quantity', 'product_quantity',
  'energy-kcal_100g', 'energy_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'fiber_100g', 'added-sugars_100g']
const NUTRIENTS = COLS.filter((c) => c.endsWith('_100g'))
const ml = (s) => /\d\s*(ml|l|ltr|litre|liter)\b/i.test(s ?? '')

// Pass a downloaded copy to skip the download (recommended: curl -C - resumes a dropped connection):
//   curl -L -C - -o /tmp/off.csv.gz https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz
//   node --experimental-strip-types app/src/data/packaged/build-packaged.mjs /tmp/off.csv.gz
const local = process.argv[2]
let input
if (local) input = createReadStream(local)
else {
  const res = await fetch(EXPORT, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`export: HTTP ${res.status}`)
  input = Readable.fromWeb(res.body)
}
const lines = createInterface({ input: input.pipe(createGunzip()), crlfDelay: Infinity })
let at = null
let seenRows = 0
const raw = []
for await (const line of lines) {
  const f = line.split('\t')
  if (!at) { at = Object.fromEntries(COLS.map((c) => [c, f.indexOf(c)])); continue }
  if (++seenRows % 500000 === 0) console.error(`${seenRows} rows read, ${raw.length} from India`)
  if (!f[at.countries_tags]?.includes('en:india')) continue
  const get = (c) => f[at[c]] || undefined
  raw.push({
    code: get('code'), product_name: get('product_name'), brands: get('brands'), countries_tags: ['en:india'],
    serving_size: get('serving_size'), serving_quantity: get('serving_quantity'),
    serving_quantity_unit: ml(get('serving_size')) ? 'ml' : 'g',
    product_quantity: get('product_quantity'), product_quantity_unit: ml(get('quantity')) ? 'ml' : 'g',
    nutriments: Object.fromEntries(NUTRIENTS.map((c) => [c, get(c)]).filter(([, v]) => v != null)),
  })
}
console.error(`${seenRows} rows read, ${raw.length} sold in India`)

const reasons = {}
const seen = new Set()
const rows = []
for (const p of raw) {
  const x = fromOff(p)
  if (!/^\d{8,14}$/.test(x.code)) { reasons.bad_code = (reasons.bad_code ?? 0) + 1; continue }
  if (x.issues.length) { for (const i of x.issues) reasons[i] = (reasons[i] ?? 0) + 1; continue }
  const brand = (p.brands?.split(',')[0] ?? '').trim()
  const key = `${x.food.name.toLowerCase()}|${brand.toLowerCase()}`
  if (seen.has(key)) { reasons.duplicate = (reasons.duplicate ?? 0) + 1; continue }
  seen.add(key)
  const v = x.per100
  const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10)
  // Compact row: code, name, brand, kcal, protein, carbs, fat, fibre, added sugar (per 100 g/ml), portions, liquid
  rows.push([
    x.code, x.food.name, brand || null,
    Math.round(v.kcal), r1(v.protein_g), r1(v.carbs_g), r1(v.fat_g), r1(v.fiber_g), r1(v.added_sugar_g),
    x.food.portions.map((q) => [q.label, q.grams]),
    x.food.notes ? 1 : 0,
  ])
}
rows.sort((a, b) => a[1].localeCompare(b[1]))

const out = {
  version: new Date().toISOString().slice(0, 7),
  generated: new Date().toISOString().slice(0, 10),
  source: 'Open Food Facts, https://world.openfoodfacts.org — Open Database License (ODbL) 1.0; contents DbCL 1.0',
  fields: ['code', 'name', 'brand', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'added_sugar_g', 'portions', 'liquid'],
  products: rows,
}
const file = join(dirname(fileURLToPath(import.meta.url)), 'packaged-in.json')
writeFileSync(file, JSON.stringify(out))
console.error(`kept ${rows.length} of ${raw.length}; left out:`, reasons)
