// Pure-function tests for food search ranking and portion → nutrient maths (TF-36).
// Run: cd app && npm test   (Node's built-in test runner; no extra dependency)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildIndex, foodUsage, normalize, searchFoods, squash, topFoods } from '../src/lib/foodSearch.ts'
import { foodRef, nutrientsFor, portionGrams, portionText } from '../src/lib/nutrition.ts'
import { macroTargets, suggestedKcal } from '../src/lib/macros.ts'
import { myFoodsFrom } from '../src/lib/myFoods.ts'
import { checkEstimate, normalizeQuery, requestFor, parseResponse } from '../../supabase/functions/estimate-food/shared.ts'
import type { FoodDataset } from '../src/data/foods/schema.ts'

const data: FoodDataset = JSON.parse(fs.readFileSync(new URL('../src/data/foods/foods.sample.json', import.meta.url), 'utf8'))
const index = buildIndex(data.foods)
const ids = (q: string, usage?: Record<string, number>) => searchFoods(index, q, usage).map((f) => f.id)
const food = (id: string) => data.foods.find((f) => f.id === id)!

test('normalise: case, accents, punctuation', () => {
  assert.equal(normalize('  Dāl-Makhani '), 'dal makhani')
  assert.equal(squash('chapatti'), squash('chapati'))
  assert.equal(squash('dhal'), squash('dal'))
})

test('exact alias and spelling variants', () => {
  assert.equal(ids('chapati')[0], 'roti-whole-wheat')
  assert.equal(ids('Chapatti')[0], 'roti-whole-wheat')
  assert.equal(ids('CHAPĀTI')[0], 'roti-whole-wheat')
  assert.equal(ids('dhal')[0], 'toor-dal-cooked')
  assert.equal(ids('paneer')[0], 'paneer')
  assert.equal(ids('panner')[0], 'paneer')
})

test('prefix while typing, including half-typed words', () => {
  assert.equal(ids('ro')[0], 'roti-whole-wheat')
  assert.equal(ids('pan')[0], 'paneer')
  assert.ok(ids('chicken br').includes('chicken-breast-cooked'))
  assert.equal(ids('chicken br')[0], 'chicken-breast-cooked')
  assert.ok(ids('dal coo').includes('toor-dal-cooked'))
})

test('ranking: exact > prefix > contains', () => {
  // both names start with "egg": the shorter one first
  assert.deepEqual(ids('egg').slice(0, 2), ['egg-boiled', 'egg-white-boiled'])
  // "chicken": exact alias of chicken breast beats the prefix match of chicken biryani
  assert.deepEqual(ids('chicken').slice(0, 2), ['chicken-breast-cooked', 'chicken-biryani-restaurant'])
  // contains: "ryani" is only inside biryani
  assert.equal(ids('ryani')[0], 'chicken-biryani-restaurant')
})

test('cooked before raw, even when the raw form has the exact alias', () => {
  const full: FoodDataset = JSON.parse(fs.readFileSync(new URL('../src/data/foods/foods.json', import.meta.url), 'utf8'))
  const ix = buildIndex(full.foods)
  const first = (q: string) => searchFoods(ix, q)[0]?.id
  assert.equal(first('toor dal'), 'toor-dal-cooked')
  assert.equal(first('toor dal raw'), 'toor-dal-raw')
  assert.match(first('rice') ?? '', /cooked/)
})

test('typos', () => {
  assert.equal(ids('chiken')[0], 'chicken-breast-cooked')
  assert.equal(ids('biryni')[0], 'chicken-biryani-restaurant')
  assert.equal(ids('banan')[0], 'banana')
  assert.deepEqual(ids('xyzzy'), [])
  assert.deepEqual(ids('   '), [])
})

test('frequent foods win ties', () => {
  const usage = { 'chicken-biryani-restaurant': 5 }
  // "chick" is a prefix of both names (same rank), so usage decides
  assert.equal(ids('chick')[0], 'chicken-breast-cooked') // shorter name wins with no usage
  assert.equal(ids('chick', usage)[0], 'chicken-biryani-restaurant')
})

test('recent / frequent foods for an empty query', () => {
  const entries = [
    { food_id: 'paneer', local_date: '2026-09-25' },
    { food_id: 'paneer', local_date: '2026-09-26' },
    { food_id: 'roti-whole-wheat', local_date: '2026-10-23' },
    { food_id: 'roti-whole-wheat', local_date: '2026-10-22' },
    { food_id: 'banana', local_date: '2026-10-23' },
    { food_id: null, local_date: '2026-10-23' },
  ]
  assert.deepEqual(topFoods(foodUsage(entries, '2026-10-23')), ['roti-whole-wheat', 'banana', 'paneer'])
})

test('portion → grams → nutrients', () => {
  const roti = food('roti-whole-wheat')
  const one = roti.portions.find((p) => p.default)!
  assert.equal(portionGrams(one, 2), 80)
  assert.equal(portionGrams(null, 180), 180)
  // 80 g roti at 297 kcal / 9.8 g protein per 100 g
  // fibre 8.5 g / 100 g; the sample has no added-sugar value, so it stays unknown (null), not 0
  assert.deepEqual(nutrientsFor(roti, 80), { grams: 8, kcal: 238, carbs_g: 40, fat_g: 5, fiber_g: 7, added_sugar_g: null })
  const dal = food('toor-dal-cooked')
  assert.deepEqual(nutrientsFor(dal, portionGrams(dal.portions[0], 1.5)), { grams: 15, kcal: 272, carbs_g: 52, fat_g: 1, fiber_g: 15, added_sugar_g: null })
  assert.deepEqual(nutrientsFor(food('banana'), 0), { grams: 0, kcal: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, added_sugar_g: null })
  const sweet = { ...roti, per100g: { ...roti.per100g, added_sugar_g: 30 } }
  assert.equal(nutrientsFor(sweet, 50).added_sugar_g, 15)
})

test('stored reference and portion text', () => {
  const dal = food('toor-dal-cooked')
  const ref = foodRef(dal, dal.portions[0], 2)
  assert.deepEqual(ref, { food_id: 'toor-dal-cooked', portion_label: '1 katori', portion_qty: 2, portion_grams: 300 })
  assert.equal(portionText(ref), '2 × katori')
  assert.equal(portionText({ ...ref, portion_qty: 1 }), '1 katori')
  assert.equal(portionText(foodRef(dal, null, 180)), '180 g')
  assert.equal(portionText({ portion_label: null, portion_qty: null, portion_grams: null }), null)
})

test('macro targets: lose fat at 2000 kcal, 80 kg', () => {
  const t = macroTargets('lose_fat', 2000, 80)
  assert.equal(t.protein.value, 160)                 // 2.0 g/kg
  assert.equal(t.fat!.value, 56)                     // 25% of 2000 / 9 = 55.6 (above the 0.6 g/kg = 48 g floor)
  assert.equal(t.carbs!.value, 214)                  // (2000 − 160×4 − 56×9) / 4
  assert.equal(t.fiber.value, 28)                    // 14 g per 1000 kcal
  assert.deepEqual([t.sugar!.value, t.sugar!.ideal, t.sugar!.kind], [50, 25, 'max'])  // 10% / 5% of kcal at 4 kcal/g
})

test('macro targets: floors, ranges, no calorie target', () => {
  // low calories: fat floor 0.6 g/kg wins (0.25 × 1400 / 9 = 39 < 48), fibre floor 25 g
  const low = macroTargets('lose_fat', 1400, 80)
  assert.equal(low.fat!.value, 48)
  assert.equal(low.fiber.value, 25)
  assert.equal(macroTargets('maintain', 2400, 70).protein.value, 112)        // 1.6 g/kg
  const build = macroTargets('build_muscle', 2700, 70)
  assert.deepEqual([build.protein.value, build.fat!.value, build.fat!.high], [126, 75, 90])  // 1.8 g/kg; fat 25–30%
  const none = macroTargets('lose_fat', null, 70)
  assert.deepEqual([none.kcal, none.fat, none.carbs, none.sugar, none.protein.value, none.fiber.value], [null, null, null, null, 140, 25])
  assert.equal(suggestedKcal('lose_fat', 78), 1850)  // 24 kcal/kg, rounded to 50
  assert.equal(suggestedKcal('maintain', 70), 2100)
})

// AI estimates: the Edge Function's shared checks
const est = { is_food: true, name: 'Aloo paratha with butter', portion: '2 parathas', grams: 260, kcal: 640,
  protein_g: 14, carbs_g: 82, fat_g: 28, fiber_g: 8, added_sugar_g: 0, assumptions: 'Home style, 1 tsp butter each.' }

test('AI estimate sanity check', () => {
  assert.equal(normalizeQuery('  2 Aloo-Parathas, with BÜTTER '), '2 aloo parathas with butter')
  const ok = checkEstimate(est)
  assert.ok(ok.ok && ok.estimate.confidence === 'estimate' && ok.estimate.kcal === 640)
  const reason = (o: object) => { const r = checkEstimate({ ...est, ...o }); return r.ok ? 'ok' : r.reason }
  assert.equal(reason({ is_food: false }), 'not_food')
  assert.equal(reason({ kcal: 1500 }), 'energy_mismatch')           // 4P+4C+9F = 636, not 1500
  assert.equal(reason({ kcal: -5 }), 'bad_number')
  assert.equal(reason({ grams: 0 }), 'grams_out_of_range')
  assert.equal(reason({ fiber_g: 90 }), 'parts_exceed_carbs')
  assert.equal(reason({ grams: 100 }), 'macros_exceed_weight')      // 124 g of macros in 100 g of food
  assert.equal(reason({ grams: 60 }), 'too_dense')                  // 640 kcal in 60 g is denser than pure fat
  assert.equal(reason({ kcal: 30, protein_g: 0, carbs_g: 7, fat_g: 0, fiber_g: 0, grams: 100 }), 'ok')  // small: 25 kcal slack
})

test('AI request: structured output, fallback only where supported', () => {
  const sonnet = requestFor('claude-sonnet-5-5', 'dal')
  assert.equal(sonnet.output_config.format.type, 'json_schema')
  assert.equal(sonnet.output_config.effort, 'medium')
  assert.deepEqual([sonnet.betas, sonnet.fallbacks], [['server-side-fallback-2026-07-01'], 'default'])
  assert.ok(!('thinking' in sonnet))                                 // adaptive by default; never "disabled"
  const haiku = requestFor('claude-haiku-5-5', 'dal')
  assert.ok(!('fallbacks' in haiku) && !('betas' in haiku))
  assert.deepEqual(parseResponse({ stop_reason: 'refusal', content: [] }), { ok: false, reason: 'refusal' })
  assert.deepEqual(parseResponse({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"is' }] }), { ok: false, reason: 'truncated' })
  const good = parseResponse({ stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text: JSON.stringify(est) }] })
  assert.ok(good.ok && good.output.kcal === 640)
})

test('AI-estimated foods become searchable: newest wins, one serving = what was logged', () => {
  const e = (id: string, food_id: string | null, label: string, at: string, grams: number, kcal: number, portion_grams: number) => ({
    id, food_id, label, logged_at: at, local_date: at.slice(0, 10), quick_add_id: null, grams, kcal,
    carbs_g: 10, fat_g: 5, fiber_g: null, added_sugar_g: 2, portion_label: null, portion_qty: null, portion_grams,
  })
  const foods = myFoodsFrom([
    e('a1', 'ai:c1', 'Soya chaap roll', '2026-10-20T12:00:00Z', 18, 400, 200),
    e('a2', 'ai:c1', 'Soya chaap roll', '2026-10-28T12:00:00Z', 20, 420, 200),   // newer: wins
    e('a3', 'ai:estimate', 'Office thali', '2026-10-25T12:00:00Z', 22, 700, 450),
    e('a4', 'dal-fry', 'Dal fry', '2026-10-25T12:00:00Z', 9, 180, 150),          // not AI: ignored
  ])
  assert.deepEqual(foods.map((f) => f.name), ['Soya chaap roll', 'Office thali'])
  const roll = foods[0]
  assert.equal(roll.id, 'ai:c1')
  assert.equal(roll.confidence, 'estimate')
  assert.deepEqual(nutrientsFor(roll, roll.portions[0].grams), { grams: 20, kcal: 420, carbs_g: 10, fat_g: 5, fiber_g: null, added_sugar_g: 2 })
  assert.match(foods[1].id, /^ai:e-/)
  assert.equal(searchFoods(buildIndex(foods), 'chaap')[0]?.name, 'Soya chaap roll')
})

// ---------- Packaged foods (Open Food Facts) ----------
import { checkNumbers, fromOff, labelEntry, packPortions, productName, rankPackaged, validBarcode, type OffProduct } from '../src/lib/packaged.ts'
const off = (code: string): OffProduct => JSON.parse(fs.readFileSync(new URL(`./fixtures/off/${code}.json`, import.meta.url), 'utf8'))

test('barcodes: check digit, lengths', () => {
  for (const ok of ['8901262150378', '8906116956571', '8904335602385', '96385074', '036000291452']) assert.equal(validBarcode(ok), true, ok)
  for (const bad of ['8901262150377', '890126215037', 'abc', '', '123456789012345']) assert.equal(validBarcode(bad), false, bad)
})

test('OFF product → food: names, portions, nutrients', () => {
  const bar = fromOff(off('8904335602385'))   // Yoga Bar Protein Bar, 1 bar (50 g)
  assert.equal(bar.food.id, 'off:8904335602385')
  assert.equal(bar.food.name, 'Yoga Bar Protein Bar')
  assert.deepEqual(bar.food.portions, [{ label: '1 bar (50 g)', grams: 50, default: true }])
  assert.deepEqual(nutrientsFor(bar.food, 50), { grams: 10, kcal: 181, carbs_g: 28, fat_g: 4, fiber_g: 4, added_sugar_g: 13 })
  assert.deepEqual(bar.issues, [])
  assert.equal(bar.india, true)

  const whey = fromOff(off('8906116956571'))  // 38.5 g scoop; 1.75 kg tub is not offered as a portion
  assert.equal(whey.food.name, 'Muscleblaze Biozyme Whey')
  assert.deepEqual(whey.food.portions.map((p) => p.label), ['1 serving (38.5 g)'])
  assert.equal(nutrientsFor(whey.food, 38.5).grams, 25)

  const yog = fromOff(off('8906059635021'))   // serving 85 g, pack 90 g
  assert.deepEqual(yog.food.portions.map((p) => [p.label, p.grams, !!p.default]), [['1 serving (85 g)', 85, true], ['1 pack (90 g)', 90, false]])

  const lassi = fromOff(off('8901262153607')) // Amul Protein Lassi, ml
  assert.equal(lassi.food.name, 'Amul Protein Lassi - Plain')
  assert.equal(lassi.food.portions[0].label, '1 serving (200 ml)')
  assert.match(lassi.food.notes ?? '', /ml/)
  assert.equal(nutrientsFor(lassi.food, 200).grams, 15)
})

test('OFF data checks', () => {
  assert.deepEqual(checkNumbers({ kcal: null, protein_g: 20, carbs_g: 1, fat_g: 1, fiber_g: null, added_sugar_g: null }), ['no_nutrition'])
  assert.deepEqual(checkNumbers({ kcal: 0, protein_g: 46.7, carbs_g: 10, fat_g: 5, fiber_g: null, added_sugar_g: null }), ['energy'])
  assert.deepEqual(checkNumbers({ kcal: 380, protein_g: 120, carbs_g: 10, fat_g: 5, fiber_g: null, added_sugar_g: null }), ['implausible', 'energy'])
  assert.deepEqual(checkNumbers({ kcal: 35, protein_g: 3.5, carbs_g: 5, fat_g: 0.1, fiber_g: null, added_sugar_g: 0 }), [])
  // kJ only → kcal
  const kj = fromOff({ code: '96385074', product_name: 'Test', nutriments: { energy_100g: 1674, proteins_100g: 20, carbohydrates_100g: 50, fat_100g: 10 } })
  assert.equal(Math.round(kj.food.per100g.kcal), 400)
  assert.deepEqual(fromOff({ code: '96385074', nutriments: {} }).issues, ['no_name', 'no_nutrition'])
  assert.equal(productName({ product_name: 'amul gold', brands: 'Amul' }), 'amul gold')
  assert.equal(productName({ product_name: 'Greek Yogurt', brands: ['epigamia'] }), 'Epigamia Greek Yogurt')
  assert.equal(packPortions({ serving_size: '1 heaped scoop of our finest whey blend (33 g)', serving_quantity: 33 })[0].label, '1 serving (33 g)')
})

test('packaged search ranking: nutrition only, clean records first, then India', () => {
  const p = (code: string, india: boolean, kcal: number | null) => fromOff({ code, product_name: code, countries_tags: india ? ['en:india'] : [], nutriments: { 'energy-kcal_100g': kcal ?? undefined, proteins_100g: 10, carbohydrates_100g: 10, fat_100g: 5 } })
  const ranked = rankPackaged([p('abroad', false, 125), p('missing', true, null), p('typo', true, 0), p('good', true, 125)])
  assert.deepEqual(ranked.map((x) => x.code), ['good', 'abroad', 'typo'])
})

test('label form: per 100 g or per serving, eaten in servings or grams', () => {
  const values = { grams: 20, kcal: 362, carbs_g: 55, fat_g: 9, fiber_g: 8, added_sugar_g: null }
  const a = labelEntry({ name: 'Yoga Bar', code: '8904335602385', basis: 'per100', servingGrams: 50, values, amount: 1, unit: 'serving' })
  assert.ok('n' in a)
  assert.deepEqual(a.n, { grams: 10, kcal: 181, carbs_g: 28, fat_g: 5, fiber_g: 4, added_sugar_g: null })
  assert.deepEqual(a.ref, { food_id: 'off:8904335602385', portion_label: '1 serving (50 g)', portion_qty: 1, portion_grams: 50 })
  const b = labelEntry({ name: 'Protein Wafer!', code: null, basis: 'serving', servingGrams: 40, values: { ...values, grams: 10 }, amount: 60, unit: 'g' })
  assert.ok('n' in b)
  assert.equal(b.n.grams, 15)
  assert.equal(b.ref.food_id, 'label:protein-wafer')
  assert.equal(b.ref.portion_label, null)
  assert.ok('error' in labelEntry({ name: '', code: null, basis: 'per100', servingGrams: null, values, amount: 50, unit: 'g' }))
  assert.ok('error' in labelEntry({ name: 'X', code: null, basis: 'serving', servingGrams: null, values, amount: 1, unit: 'serving' }))
  assert.ok('error' in labelEntry({ name: 'X', code: null, basis: 'per100', servingGrams: null, values: { ...values, grams: null, kcal: null }, amount: 50, unit: 'g' }))
})

test('scanned packs and label foods are remembered with the portion used', () => {
  const base = { quick_add_id: null, local_date: '2026-10-30', carbs_g: 56, fat_g: 9, fiber_g: 8, added_sugar_g: 26 }
  const foods = myFoodsFrom([
    { ...base, id: 'e1', food_id: 'off:8904335602385', label: 'Yoga Bar Protein Bar', logged_at: '2026-10-30T10:00:00Z', grams: 20, kcal: 362, portion_label: '1 bar (50 g)', portion_qty: 2, portion_grams: 100 },
    { ...base, id: 'e2', food_id: 'label:protein-wafer', label: 'Protein wafer', logged_at: '2026-10-29T10:00:00Z', grams: 15, kcal: 300, portion_label: null, portion_qty: null, portion_grams: 60 },
  ])
  assert.deepEqual(foods.map((f) => [f.name, f.source.name, f.portions[0].label, f.portions[0].grams]),
    [['Yoga Bar Protein Bar', 'Open Food Facts', '1 bar (50 g)', 50], ['Protein wafer', 'Pack label', '1 serving', 60]])
  assert.equal(nutrientsFor(foods[0], 50).grams, 10)
})

test('OFF record missing carbs or fat goes to the label form, keeping unknowns unknown', () => {
  const junk = fromOff({ code: '2009876543213', product_name: 'snacks', nutriments: { 'energy-kcal_100g': 410, proteins_100g: 8 } })
  assert.deepEqual(junk.issues, ['partial'])
  assert.equal(junk.per100.carbs_g, null)
  assert.equal(junk.per100.fat_g, null)
  assert.deepEqual(rankPackaged([junk]).map((x) => x.code), ['2009876543213'])   // still listed: protein and kcal are there
})

// ---------- Reminders (TF-20) ----------
import { dueKinds, localNow, messageFor } from '../../supabase/functions/send-reminders/shared.ts'

test('reminders: local time in the person’s time zone', () => {
  const t = new Date('2026-11-01T15:35:00Z')
  assert.deepEqual(localNow('Asia/Kolkata', t), { date: '2026-11-01', minutes: 21 * 60 + 5 })   // 21:05 IST
  assert.deepEqual(localNow('America/New_York', t), { date: '2026-11-01', minutes: 10 * 60 + 35 })
  assert.deepEqual(localNow('Asia/Kolkata', new Date('2026-11-01T19:00:00Z')).date, '2026-11-02')   // 00:30 IST next day
})

test('reminders: due within 90 minutes of the time, once a day, only if switched on', () => {
  const s = { time_zone: 'Asia/Kolkata', food_on: true, food_at: '21:00:00', protein_on: true, protein_at: '19:00:00', workout_on: false, workout_at: '18:00:00' }
  assert.deepEqual(dueKinds(s, 20 * 60 + 29, []), ['protein'])
  assert.deepEqual(dueKinds(s, 20 * 60 + 30, []), [])               // 90 minutes after 19:00: window closed
  assert.deepEqual(dueKinds(s, 21 * 60, []), ['food'])               // protein's window (19:00–20:30) is over
  assert.deepEqual(dueKinds(s, 19 * 60 + 15, ['protein']), [])       // already sent today
  assert.deepEqual(dueKinds(s, 18 * 60, []), [])                     // workout switched off
  assert.deepEqual(dueKinds({ ...s, protein_at: '20:00:00' }, 21 * 60 + 15, []), ['protein', 'food'])
  assert.deepEqual(dueKinds(s, 22 * 60 + 30, []), [])                // food's window closed at 22:30
})

test('reminders: only sent when still relevant', () => {
  const f = { foods: 1, protein: 62, goal: 100, planned: true, trained: false }
  assert.match(messageFor('food', f)!.body, /Only 1 food/)
  assert.equal(messageFor('food', { ...f, foods: 2 }), null)
  assert.equal(messageFor('protein', f)!.body, '62 of 100 g so far, 38 g to go.')
  assert.equal(messageFor('protein', { ...f, protein: 100 }), null)
  assert.equal(messageFor('workout', f)!.url, '/WheyAndWeights/?tab=lift')
  assert.equal(messageFor('workout', { ...f, trained: true }), null)
  assert.equal(messageFor('workout', { ...f, planned: false }), null)
})
