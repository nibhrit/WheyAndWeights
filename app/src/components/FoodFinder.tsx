import { useMemo, useState } from 'react'
import { addQuickAdd, useStore } from '../data/store'
import type { FoodRef, Nutrients } from '../data/types'
import type { Food, Portion } from '../data/foods/schema'
import { localDate } from '../lib/dates'
import { buildIndex, foodUsage, searchRanked, topFoods } from '../lib/foodSearch'
import { isMyFood, myFoodsFrom } from '../lib/myFoods'
import {
  GRAM_STEP, MAX_GRAMS, MAX_QTY, QTY_STEP, defaultPortion, fmtQty, foodRef, nutrientsFor, portionGrams, portionText,
} from '../lib/nutrition'
import { aiFoodId, estimateFood, type AiEstimate } from '../lib/aiEstimate'
import { useFoods } from '../lib/useFoods'
import { lookupBarcode, searchPackaged } from '../lib/off'
import { ISSUE_TEXT, OFF_SOURCE, needsLabel, type Issue, type Packaged } from '../lib/packaged'
import Scanner from './Scanner'
import LabelForm, { type LabelStart } from './LabelForm'

// Find a food and say how much: search the food list (or ask for an AI estimate when it isn't there), scan a pack's
// barcode or search packaged foods (Open Food Facts), pick a portion, see the nutrients, then submit.
// Used to log food, and to link a saved food or an old entry to a food.

const toNum = (v: string) => (/^\d+([.,]\d+)?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : NaN)

// A match this weak (contains / typo) or none at all offers an AI estimate
const WEAK = 3
const MIN_AI_QUERY = 3
const MINE_NOTE: Record<string, string> = { 'AI estimate': ' · your AI estimate', 'Open Food Facts': ' · pack you logged', 'Pack label': ' · from a pack label' }

type Chosen = { food: Food; portion: Portion | null; qty: number }

type FinderProps = {
  initialQuery?: string
  submitLabel: string
  onDone: (n: Nutrients, ref: FoodRef, name: string) => void
  onCancel?: () => void       // shows Cancel on the search itself (when linking)
  note?: React.ReactNode      // shown above the numbers once a food is picked, e.g. what it replaces
  saveQuick?: boolean         // offer "Save as one-tap food"
  footer?: React.ReactNode
}

export default function FoodFinder({ initialQuery = '', submitLabel, onDone, onCancel, note, saveQuick, footer }: FinderProps) {
  const store = useStore()
  const foods = useFoods()
  const [query, setQuery] = useState(initialQuery)
  const [focused, setFocused] = useState(false)
  const [picked, setPicked] = useState<Chosen | null>(null)
  const [ai, setAi] = useState<{ estimate: AiEstimate; cacheId: string | null } | null>(null)
  const [aiState, setAiState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const [scanning, setScanning] = useState(false)
  const [pack, setPack] = useState<PackState | null>(null)       // a barcode being looked up, or why it failed
  const [issues, setIssues] = useState<Issue[]>([])              // what's wrong with the picked product's record
  const [label, setLabel] = useState<(LabelStart & { intro?: string }) | null>(null)    // the label form, prefilled
  const [packed, setPacked] = useState<{ busy: boolean; error: string | null; items: Packaged[] | null }>({ busy: false, error: null, items: null })
  // Your own foods (AI estimates, scanned packs, pack labels) are searchable alongside the list
  const mine = useMemo(() => myFoodsFrom([...store.protein, ...(store.ownFoods ?? [])]), [store.protein, store.ownFoods])
  const mineIndex = useMemo(() => buildIndex(mine), [mine])

  const done = (n: Nutrients, ref: FoodRef, name: string) => {
    onDone(n, ref, name); setPicked(null); setAi(null); setLabel(null); setPack(null); setQuery(''); setPacked({ busy: false, error: null, items: null })
  }

  // ---------- Packaged foods ----------
  // A complete product opens in the portion picker; one missing protein, kcal, carbs or fat opens the label form,
  // prefilled with what Open Food Facts has, so a missing number stays unknown instead of becoming 0
  function openProduct(p: Packaged) {
    setPack(null)
    if (needsLabel(p.issues)) return setLabel({ ...labelFromPack(p), intro: p.issues.filter((i) => i !== 'no_name').map((i) => ISSUE_TEXT[i]).join(' ') + ' Fill in the rest from the label.' })
    setIssues(p.issues)
    pick(p.food)
  }
  async function openBarcode(code: string, fallback?: Packaged) {
    // Logged this pack before? Your saved numbers (including label corrections) win over the shared record
    const yours = mine.find((f) => f.id === `off:${code}`)
    if (yours) { setIssues([]); return pick(yours) }
    setPack({ code, state: 'loading' })
    const r = await lookupBarcode(code)
    if (r.ok) return openProduct(r.product)
    if (fallback && r.reason !== 'not_found') return openProduct(fallback)   // search result, when the lookup can't be done
    setPack({ code, state: r.reason })
  }
  async function searchPacks() {
    setPacked({ busy: true, error: null, items: null })
    const r = await searchPackaged(q)
    setPacked(r.ok ? { busy: false, error: null, items: r.products } : { busy: false, error: r.message, items: null })
  }

  if (scanning) return <Scanner onCode={(code) => { setScanning(false); openBarcode(code) }} onClose={() => setScanning(false)} />
  if (label) {
    return <LabelForm {...label} submitLabel={submitLabel} onSubmit={done} onCancel={() => setLabel(null)}
      intro={label.intro ?? (label.code && !label.per100 ? 'Type what the label says. It’ll be in your search next time.' : undefined)} />
  }
  if (pack) return <PackCard pack={pack} onLabel={() => setLabel({ name: '', code: pack.code })} onRetry={() => openBarcode(pack.code)}
    onAi={(name) => { setPack(null); setQuery(name); askAi(name) }} onCancel={() => setPack(null)} />
  if (picked) {
    const offFood = picked.food.source.name === OFF_SOURCE
    const packNote = offFood && (
      <>
        {issues.filter((i) => i !== 'no_name').map((i) => <span key={i} className="warn">{ISSUE_TEXT[i]} </span>)}
        {isMyFood(picked.food) && mine.includes(picked.food) ? 'Your numbers from last time.' : 'From Open Food Facts.'}{' '}
        <button type="button" className="link small" onClick={() => { setLabel(labelFrom(picked.food, picked.food.id.replace(/^off:/, ''), false)); setPicked(null) }}>
          Numbers wrong? Type from label
        </button>
      </>
    )
    return (
      <PortionPicker {...picked} submitLabel={submitLabel} note={packNote || note} saveQuick={saveQuick}
        onSubmit={(n, ref) => done(n, ref, picked.food.name)} onCancel={() => { setPicked(null); setIssues([]) }} />
    )
  }
  if (ai) {
    return (
      <AiCard {...ai} submitLabel={submitLabel} note={note} saveQuick={saveQuick}
        onSubmit={(n, ref, name) => done(n, ref, name)} onCancel={() => setAi(null)} />
    )
  }

  const usage = foodUsage(store.protein, localDate())
  const q = query.trim()
  const ranked = foods && q
    ? [...searchRanked(mineIndex, query, usage), ...searchRanked(foods.index, query, usage)].sort((a, b) => a.score - b.score).slice(0, 8)
    : []
  const byId = (id: string) => foods?.foodById(id) ?? mine.find((f) => f.id === id)
  const results = !foods ? [] : q
    ? ranked.map((h) => h.food)
    : focused ? topFoods(usage).map(byId).filter((f): f is Food => !!f) : []
  const offerAi = !!foods && q.length >= MIN_AI_QUERY && (!ranked.length || ranked[0].score >= WEAK)

  // A recent food opens with the portion used last time
  function pick(food: Food) {
    const last = [...store.protein].reverse().find((e) => e.food_id === food.id)
    const portion = last?.portion_label ? food.portions.find((p) => p.label === last.portion_label) ?? null
      : last && !isMyFood(food) ? null : defaultPortion(food)   // your own foods open on the portion you used
    const qty = last && (portion ? last.portion_qty : last.portion_grams) || (portion ? 1 : 100)
    setPicked({ food, portion, qty })
  }

  async function askAi(text = q) {
    setAiState({ busy: true, error: null })
    const r = await estimateFood(text)
    if (r.ok) { setAi({ estimate: r.estimate, cacheId: r.cacheId }); setAiState({ busy: false, error: null }) }
    else setAiState({ busy: false, error: r.message })
  }

  return (
    <div className="card form">
      <div className="search-row">
        <input
          className="search" type="search" placeholder="Search food: roti, dal, paneer…" aria-label="Search food"
          autoComplete="off" enterKeyHint="search" value={query}
          onChange={(e) => { setQuery(e.target.value); setAiState({ busy: false, error: null }); setPacked({ busy: false, error: null, items: null }) }}
          onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 200)}
        />
        <button type="button" className="scan-btn" aria-label="Scan a barcode" onClick={() => setScanning(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 8v8M11 8v8M14 8v8M17 8v8" />
          </svg>
          <span>Scan</span>
        </button>
      </div>
      {!q && focused && results.length > 0 && <span className="cap">Recent</span>}
      {results.length > 0 && (
        <div className="results">
          {results.map((f) => <Result key={f.id} food={f} onPick={pick} />)}
        </div>
      )}
      {q && foods && !results.length && <p className="cap empty">No match for “{q}” in the food list.</p>}
      {offerAi && (
        <button type="button" className="btn ghost" disabled={aiState.busy} onClick={() => askAi()}>
          {aiState.busy ? 'Estimating…' : `Estimate “${q.length > 28 ? `${q.slice(0, 27)}…` : q}” with AI`}
        </button>
      )}
      {aiState.error && <p className="err" role="alert">{aiState.error}</p>}
      {q.length >= MIN_AI_QUERY && !packed.items && (
        <button type="button" className="btn ghost" disabled={packed.busy} onClick={searchPacks}>
          {packed.busy ? 'Searching packaged foods…' : 'Search packaged foods'}
        </button>
      )}
      {packed.error && <p className="err" role="alert">{packed.error}</p>}
      {packed.items && (
        packed.items.length ? (
          <>
            <span className="cap">Packaged foods · Open Food Facts</span>
            <div className="results">
              {packed.items.map((p) => <PackResult key={p.code} p={p} onPick={() => openBarcode(p.code, p)} />)}
            </div>
          </>
        ) : <p className="cap empty">No packaged food with nutrition found for “{q}”. Try the brand name, or scan the barcode.</p>
      )}
      {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
      {footer}
    </div>
  )
}

type PackState = { code: string; state: 'loading' | 'not_found' | 'offline' | 'busy' | 'error' }

// Prefill the label form from a looked-up product: its numbers as printed (missing ones stay empty)
function labelFromPack(p: Packaged): LabelStart {
  const v = p.per100
  return {
    name: p.issues.includes('no_name') ? '' : p.food.name, code: p.code,
    per100: { grams: v.protein_g, kcal: v.kcal, carbs_g: v.carbs_g, fat_g: v.fat_g, fiber_g: v.fiber_g, added_sugar_g: v.added_sugar_g },
    servingGrams: defaultPortion(p.food)?.grams ?? null,
  }
}

// Prefill the label form from a food being logged ("Numbers wrong? Type from label")
function labelFrom(food: Food, code: string, noName: boolean): LabelStart {
  const v = food.per100g
  const has = food.source.name === OFF_SOURCE && (v.kcal > 0 || v.protein_g > 0)
  return {
    name: noName ? '' : food.name,
    code,
    per100: has ? { grams: v.protein_g, kcal: v.kcal, carbs_g: v.carbs_g, fat_g: v.fat_g, fiber_g: v.fiber_g ?? null, added_sugar_g: v.added_sugar_g ?? null } : undefined,
    servingGrams: defaultPortion(food)?.grams ?? null,
  }
}

const PACK_TEXT: Record<Exclude<PackState['state'], 'loading'>, string> = {
  not_found: 'isn’t in Open Food Facts yet.',
  offline: 'can’t be looked up without signal.',
  busy: 'can’t be looked up right now: Open Food Facts is busy.',
  error: 'couldn’t be looked up.',
}

// A barcode being looked up, or what to do when it can't be
function PackCard({ pack, onLabel, onRetry, onAi, onCancel }: {
  pack: PackState; onLabel: () => void; onRetry: () => void; onAi: (name: string) => void; onCancel: () => void
}) {
  const [name, setName] = useState('')
  if (pack.state === 'loading') return <div className="card form" role="status"><b>Looking up {pack.code}…</b><span className="cap">Open Food Facts</span></div>
  return (
    <div className="card form">
      <b>Barcode {pack.code} {PACK_TEXT[pack.state]}</b>
      <button type="button" className="btn" onClick={onLabel}>Type from the label</button>
      {pack.state === 'not_found' && (
        <form className="ai-name" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= MIN_AI_QUERY) onAi(name.trim()) }}>
          <input className="full" aria-label="What is it?" placeholder="Or name it for AI, e.g. Yoga Bar" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn ghost" disabled={name.trim().length < MIN_AI_QUERY}>Estimate with AI</button>
        </form>
      )}
      {pack.state !== 'not_found' && <button type="button" className="btn ghost" onClick={onRetry}>Try again</button>}
      <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={onCancel}>Cancel</button>
    </div>
  )
}

// A packaged food in search results: per serving when the pack says, else per 100 g
function PackResult({ p, onPick }: { p: Packaged; onPick: () => void }) {
  const portion = defaultPortion(p.food)
  const n = nutrientsFor(p.food, portion?.grams ?? 100)
  return (
    <button className="result" onClick={onPick}>
      <span className="row-main">
        <span>{p.food.name}</span>
        <span className="cap" style={{ textAlign: 'left' }}>{portion?.label ?? 'per 100 g'}{p.issues.length ? ' · check numbers' : ''}</span>
      </span>
      <span className="cap">{n.grams} g · {n.kcal} kcal</span>
    </button>
  )
}

function Result({ food, onPick }: { food: Food; onPick: (f: Food) => void }) {
  const portion = defaultPortion(food)
  const n = nutrientsFor(food, portionGrams(portion, portion ? 1 : 100))
  const about = food.confidence === 'estimate'
  return (
    <button className="result" onClick={() => onPick(food)}>
      <span className="row-main">
        <span>{food.name} {about && <span className="about">about</span>}</span>
        <span className="cap" style={{ textAlign: 'left' }}>{portion?.label ?? '100 g'}{MINE_NOTE[food.source.name] ?? ''}</span>
      </span>
      <span className="cap">{n.grams} g · {n.kcal} kcal</span>
    </button>
  )
}

// One line of the other nutrients, leaving out what the dataset doesn't have
function restLine(n: Nutrients, grams: number) {
  return [
    `Carbs ${n.carbs_g} g`, `fat ${n.fat_g} g`,
    n.fiber_g != null && `fibre ${n.fiber_g} g`, n.added_sugar_g != null && `added sugar ${n.added_sugar_g} g`,
    `${fmtQty(Math.round(grams))} g of food`,
  ].filter(Boolean).join(' · ')
}

function SaveQuick({ name, n, ref }: { name: string; n: Nutrients; ref: FoodRef }) {
  const [saved, setSaved] = useState<string | null>(null)
  return (
    <>
      <button type="button" className="link" style={{ alignSelf: 'flex-start' }}
        onClick={() => setSaved(addQuickAdd(name.slice(0, 60), n, ref) ?? 'Saved as a one-tap food.')}>
        Save as one-tap food
      </button>
      {saved && <p className="cap" role="status" style={{ margin: 0 }}>{saved}</p>}
    </>
  )
}

// Pick a portion and how many, see protein and kcal before saving. Used to log, to link, and to edit a logged food.
type PickerProps = Chosen & {
  submitLabel: string
  onSubmit: (n: Nutrients, ref: FoodRef) => void
  onCancel: () => void
  onDelete?: () => void
  note?: React.ReactNode
  saveQuick?: boolean
}

export function PortionPicker({ food, portion: initialPortion, qty: initialQty, submitLabel, onSubmit, onCancel, onDelete, note, saveQuick }: PickerProps) {
  const [portion, setPortion] = useState<Portion | null>(initialPortion)
  const [qty, setQty] = useState(fmtQty(initialQty))
  const q = toNum(qty)
  const step = portion ? QTY_STEP : GRAM_STEP
  const max = portion ? MAX_QTY : MAX_GRAMS
  const valid = Number.isFinite(q) && q > 0 && q <= max
  const grams = valid ? portionGrams(portion, q) : 0
  const n = nutrientsFor(food, grams)
  const ref = valid ? foodRef(food, portion, q) : null
  const about = food.confidence === 'estimate' ? 'about ' : ''
  const empty = valid && n.grams === 0 && n.kcal === 0

  function choose(p: Portion | null) {
    if (p === portion) return
    // A new portion starts at 1 (grams at 100); the user adjusts from there
    setPortion(p)
    setQty(fmtQty(p ? 1 : 100))
  }
  const bump = (d: number) => {
    const next = Math.round(((valid ? q : 0) + d * step) / step) * step
    setQty(fmtQty(Math.min(max, Math.max(step, next))))
  }

  return (
    <form className="card form" noValidate onSubmit={(e) => { e.preventDefault(); if (ref && !empty) onSubmit(n, ref) }}>
      <div className="card-top">
        <b>{food.name}</b>
        {about && <span className="about">about</span>}
      </div>

      <div className="chips" role="group" aria-label="Portion">
        {food.portions.map((p) => (
          <button key={p.label} type="button" className="chip portion" aria-pressed={portion === p} onClick={() => choose(p)}>
            {p.label}{!p.label.includes('(') && <> <span className="cap">{p.grams} g</span></>}
          </button>
        ))}
        <button type="button" className="chip portion" aria-pressed={portion === null} onClick={() => choose(null)}>grams</button>
      </div>

      <div className="qty-row">
        <span className="cap">{portion ? `How many × ${portion.label.replace(/^1\s+/, '')}` : 'How many grams'}</span>
        <div className="stepper">
          <button type="button" className="pm" aria-label="Less" onClick={() => bump(-1)}>−</button>
          <input className="weight num" inputMode="decimal" aria-label={portion ? 'Quantity' : 'Grams'} value={qty}
            onChange={(e) => setQty(e.target.value)} />
          <button type="button" className="pm" aria-label="More" onClick={() => bump(1)}>+</button>
        </div>
      </div>

      {note && <p className="cap note">{note}</p>}
      {valid ? (
        <>
          <div className="food-preview" aria-live="polite">
            <span><span className="cap">{about}</span><span className="num tone-protein">{n.grams}</span> <span className="cap">g protein</span></span>
            <span><span className="cap">{about}</span><span className="num">{n.kcal}</span> <span className="cap">kcal</span></span>
          </div>
          <span className="cap">{restLine(n, grams)}</span>
        </>
      ) : (
        <p className="err" role="alert">{portion ? `Enter how many, up to ${MAX_QTY}.` : `Enter grams, up to ${MAX_GRAMS}.`}</p>
      )}
      {empty && <p className="cap empty">That rounds to nothing. Add a bit more.</p>}

      <div className={onDelete ? 'three' : 'two'}>
        {onDelete && <button type="button" className="link danger" onClick={onDelete}>Delete</button>}
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn" disabled={!valid || empty}>{submitLabel}</button>
      </div>
      {saveQuick && ref && !empty && <SaveQuick name={`${food.name}, ${portionText(ref)}`} n={n} ref={ref} />}
    </form>
  )
}

// ---------- AI estimate ----------

const AI_FIELDS: [keyof Nutrients | 'portion_grams', string, number][] = [
  ['portion_grams', 'Food g', 3000], ['kcal', 'kcal', 5000], ['grams', 'Protein g', 1000], ['carbs_g', 'Carbs g', 1000],
  ['fat_g', 'Fat g', 1000], ['fiber_g', 'Fibre g', 300], ['added_sugar_g', 'Sugar g', 1000],
]

type AiProps = {
  estimate: AiEstimate
  cacheId: string | null
  submitLabel: string
  onSubmit: (n: Nutrients, ref: FoodRef, name: string) => void
  onCancel: () => void
  note?: React.ReactNode
  saveQuick?: boolean
}

// The AI's numbers, labelled as an estimate with its assumptions, all editable before logging
function AiCard({ estimate: e, cacheId, submitLabel, onSubmit, onCancel, note, saveQuick }: AiProps) {
  const [name, setName] = useState(e.name)
  const [vals, setVals] = useState<Record<string, string>>(() => ({
    kcal: String(e.kcal), grams: String(Math.round(e.protein_g)), carbs_g: String(Math.round(e.carbs_g)), fat_g: String(Math.round(e.fat_g)),
    fiber_g: String(Math.round(e.fiber_g)), added_sugar_g: String(Math.round(e.added_sugar_g)), portion_grams: String(e.grams),
  }))
  // The numbers are for one serving (what the AI described); "How many" multiplies them, like other foods
  const [qty, setQty] = useState('1')
  const q = toNum(qty)
  const num = (k: string) => toNum(vals[k] ?? '')
  const bad = AI_FIELDS.find(([k, , max]) => !(num(k) >= 0 && num(k) <= max))
  const error = bad ? `Check ${bad[1].toLowerCase()} (0 to ${bad[2]}).`
    : num('portion_grams') < 1 ? 'Enter how many grams of food.'
    : !name.trim() ? 'Enter a name.'
    : num('grams') === 0 && num('kcal') === 0 ? 'Enter protein or kcal.'
    : !(q > 0 && q <= MAX_QTY) ? `Enter how many, up to ${MAX_QTY}.` : null
  const r = (k: string) => Math.round(num(k) * (q || 0))
  const n: Nutrients = { grams: r('grams'), kcal: r('kcal'), carbs_g: r('carbs_g'), fat_g: r('fat_g'), fiber_g: r('fiber_g'), added_sugar_g: r('added_sugar_g') }
  const serving = Math.round(num('portion_grams') * 10) / 10
  const ref: FoodRef = {
    food_id: aiFoodId(cacheId), portion_label: `1 serving (${fmtQty(serving)} g)`, portion_qty: q, portion_grams: Math.round(serving * q * 10) / 10,
  }
  const bump = (d: number) => setQty(fmtQty(Math.min(MAX_QTY, Math.max(QTY_STEP, Math.round(((q || 0) + d * QTY_STEP) / QTY_STEP) * QTY_STEP))))

  return (
    <form className="card form" noValidate onSubmit={(ev) => { ev.preventDefault(); if (!error) onSubmit(n, ref, name.trim()) }}>
      <div className="card-top">
        <span className="about">AI estimate</span>
        <span className="cap">{e.portion}</span>
      </div>
      <input className="full" aria-label="Name" value={name} onChange={(ev) => setName(ev.target.value)} />
      <p className="cap note">Assumed: {e.assumptions} Check the numbers; edit any you know better.</p>
      {note && <p className="cap note">{note}</p>}
      <span className="cap">For 1 serving</span>
      <div className="ai-grid">
        {AI_FIELDS.map(([k, label]) => (
          <label key={k} className={k === 'grams' ? 'tone-protein' : undefined}>
            <span className="cap">{label}</span>
            <input className="num" inputMode="decimal" aria-label={label} value={vals[k]} onChange={(ev) => setVals({ ...vals, [k]: ev.target.value })} />
          </label>
        ))}
      </div>
      <div className="qty-row">
        <span className="cap">How many servings</span>
        <div className="stepper">
          <button type="button" className="pm" aria-label="Less" onClick={() => bump(-1)}>−</button>
          <input className="weight num" inputMode="decimal" aria-label="Servings" value={qty} onChange={(ev) => setQty(ev.target.value)} />
          <button type="button" className="pm" aria-label="More" onClick={() => bump(1)}>+</button>
        </div>
      </div>
      {!error && q !== 1 && (
        <div className="food-preview" aria-live="polite">
          <span><span className="cap">about </span><span className="num tone-protein">{n.grams}</span> <span className="cap">g protein</span></span>
          <span><span className="cap">about </span><span className="num">{n.kcal}</span> <span className="cap">kcal</span></span>
        </div>
      )}
      {error && <p className="err" role="alert">{error}</p>}
      <div className="two">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn" disabled={!!error}>{submitLabel}</button>
      </div>
      {saveQuick && !error && <SaveQuick name={name.trim()} n={n} ref={ref} />}
    </form>
  )
}
