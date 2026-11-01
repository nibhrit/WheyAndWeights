// Offline food search over the dataset's names and aliases. No library: the dataset is a few hundred foods,
// so a linear scan over pre-normalised terms takes well under a millisecond per keystroke.
//
// Ranking, best first:
//   0 exact      the whole name or an alias ("dal")
//   1 prefix     a name or alias starts with the query ("toor" → "Toor dal, cooked")
//   2 words      every typed word starts a word in it ("dal coo" → "Toor dal, cooked")
//   3 contains   the query appears inside it ("atti" → "Chapatti")
//   4 typo       every typed word is one or two letters off a word in it ("chiken" → "Chicken breast")
// Within a rank: names before aliases, foods you log often first, then shorter names.

import type { Food } from '../data/foods/schema'

// Lowercase, accents removed, letters and digits only: "Dāl-Makhani " → "dal makhani"
export function normalize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Spelling-insensitive form for Indian food names written in Latin letters, applied to both sides:
// ee → i, oo → u, h after a consonant dropped (dhal → dal), double letters single (chapatti → chapati)
export function squash(s: string) {
  return s.replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/([bcdgjkpst])h/g, '$1').replace(/([a-z])\1+/g, '$1')
}

// Each name and alias is kept in two forms, plain and squashed, and the query is compared form to form:
// plain catches half-typed words ("co" → "cooked"), squashed catches spelling variants ("chapatti" → "chapati").
type Form = { s: string; words: string[] }
type Term = { forms: [Form, Form]; alias: boolean }
export type FoodIndex = { foods: Food[]; terms: Term[][] }

const form = (s: string): Form => ({ s, words: s.split(' ') })
const forms = (text: string): [Form, Form] => {
  const plain = normalize(text)
  return [form(plain), form(squash(plain))]
}

export function buildIndex(foods: Food[]): FoodIndex {
  return { foods, terms: foods.map((f) => [{ forms: forms(f.name), alias: false }, ...f.aliases.map((a) => ({ forms: forms(a), alias: true }))]) }
}

// Edit distance (with swapped neighbours counted as one edit), giving up once it exceeds max
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1)
      cur.push(d)
      best = Math.min(best, d)
    }
    if (best > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[b.length]
}

// A typed word is "close" to a word if it's within the allowed edits of the word or of its start
// (so "chiken" matches while still typing "chicken"). Short words must match exactly: too many false hits.
function close(token: string, word: string) {
  if (token.length < 4) return false
  const max = token.length >= 8 ? 2 : 1
  for (let len = token.length - max; len <= token.length + max; len++) {
    if (len > 0 && len <= word.length && distance(token, word.slice(0, len), max) <= max) return true
  }
  return false
}

function rank(t: Form, q: Form, fuzzy = true): number | null {
  if (t.s === q.s) return 0
  if (t.s.startsWith(q.s)) return 1
  if (q.words.every((k) => t.words.some((w) => w.startsWith(k)))) return 2
  if (t.s.includes(q.s)) return 3
  if (fuzzy && q.words.every((k) => t.words.some((w) => w.startsWith(k) || close(k, w)))) return 4
  return null
}

// usage: how often each food id has been logged recently (see foodUsage), to break ties
// Raw, dry and flour forms are ingredients, not what you ate: rank them after the cooked food ("rice" → cooked rice first)
const ingredientOnly = (f: Food) => (/\b(raw|dry|flour|powder)\b/i.test(f.name) ? 1 : 0)

export const searchFoods = (index: FoodIndex, query: string, usage: Record<string, number> = {}, limit = 8): Food[] =>
  searchRanked(index, query, usage, limit).map((h) => h.food)

// With each hit's rank (0 exact … 4 typo; +0.5 when only an alias matched), e.g. to tell a good match from a weak one
// fuzzy: allow typos (slower); off for very large lists
export function searchRanked(index: FoodIndex, query: string, usage: Record<string, number> = {}, limit = 8, fuzzy = true): { food: Food; score: number }[] {
  if (!normalize(query)) return []
  const q = forms(query)
  const hits: { food: Food; score: number }[] = []
  index.foods.forEach((food, i) => {
    let score = Infinity
    for (const t of index.terms[i]) {
      for (const k of [0, 1]) {
        const r = rank(t.forms[k], q[k], fuzzy)
        if (r !== null) score = Math.min(score, r + (t.alias ? 0.5 : 0))
      }
    }
    // Ingredient forms count as a weaker match, even on an exact alias ("toor dal" → cooked first, "toor dal raw" → raw)
    if (score < Infinity) hits.push({ food, score: score + ingredientOnly(food) })
  })
  return hits
    .sort((a, b) => a.score - b.score
      || (usage[b.food.id] ?? 0) - (usage[a.food.id] ?? 0)
      || a.food.name.length - b.food.name.length
      || a.food.name.localeCompare(b.food.name))
    .slice(0, limit)
}

// How often each food was logged, weighted so recent days count more (a log today ≈ 1, a month ago ≈ 0.4)
type Logged = { food_id: string | null; local_date: string }
export function foodUsage(entries: Logged[], today: string): Record<string, number> {
  const usage: Record<string, number> = {}
  const t = Date.parse(today)
  for (const e of entries) {
    if (!e.food_id) continue
    const days = Math.max(0, (t - Date.parse(e.local_date)) / 86_400_000)
    usage[e.food_id] = (usage[e.food_id] ?? 0) + 1 / (1 + days / 20)
  }
  return usage
}

// Shown before typing: foods logged recently, most used first
export const topFoods = (usage: Record<string, number>, limit = 6) =>
  Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id)

// ---------- One search for everything (TF-57) ----------
// Your own foods (AI estimates, logged packs, labels), the food list, and packaged products, in one ranked list.
// Packs rank after a generic food of the same match quality unless you typed their brand ("lassi" → lassi;
// "amul lassi" → Amul's); your own foods win ties.

export type Source = 'mine' | 'list' | 'pack'
export type Hit = { food: Food; score: number; source: Source }

const PACK_PENALTY = 0.75   // a pack ranks after a generic food that matches as well
const BRAND_BONUS = -0.6    // typed the brand: its products beat generic foods that only list the brand as an alias
const MAX_PACKS = 6

// The whole brand name is in the query ("bread" isn't the brand "Bread House"; "amul lassi" is Amul)
export function brandTyped(query: string, brand: string | null): boolean {
  if (!brand) return false
  const q = normalize(query).split(' ')
  const b = normalize(brand).split(' ').filter(Boolean)
  return b.length > 0 && b.every((w) => q.includes(w))
}

export function searchAll(query: string, sources: {
  mine?: FoodIndex; list?: FoodIndex; pack?: FoodIndex; brandOf?: (id: string) => string | null
}, usage: Record<string, number> = {}, limit = 10): Hit[] {
  const mine = sources.mine ? searchRanked(sources.mine, query, usage, 6).map((h) => ({ ...h, score: h.score - 0.1, source: 'mine' as const })) : []
  const mineIds = new Set(mine.map((h) => h.food.id))
  const list = sources.list ? searchRanked(sources.list, query, usage, 10).map((h) => ({ ...h, source: 'list' as const })) : []
  const pack = sources.pack
    ? searchRanked(sources.pack, query, usage, MAX_PACKS * 2, false)
      .filter((h) => !mineIds.has(h.food.id))
      .map((h) => ({ ...h, score: h.score + (brandTyped(query, sources.brandOf?.(h.food.id) ?? null) ? BRAND_BONUS : PACK_PENALTY), source: 'pack' as const }))
      .slice(0, MAX_PACKS)
    : []
  return [...mine, ...list, ...pack].sort((a, b) => a.score - b.score).slice(0, limit)
}
