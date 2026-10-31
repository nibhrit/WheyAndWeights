import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { OFF_FIELDS, fromOff, rankPackaged, type OffProduct, type Packaged } from './packaged'

// Talking to Open Food Facts (TF-38).
// Barcode lookup goes straight from the phone to Open Food Facts (it allows browser calls; 15 lookups a minute per
// person). Name search goes through our Edge Function `food-search`, because the search service doesn't allow
// browser calls (10 searches a minute). Looked-up products are kept on the device, so a re-scan works offline.

const API = 'https://world.openfoodfacts.org/api/v2/product'
// Browsers can't set User-Agent; Open Food Facts accepts X-User-Agent to identify the app
const APP_ID = 'WheyAndWeights/1.0 (https://github.com/nibhrit/WheyAndWeights)'
const TIMEOUT = 10_000

export type LookupResult =
  | { ok: true; product: Packaged; cached: boolean }
  | { ok: false; reason: 'not_found' | 'offline' | 'busy' | 'error' }

// ---------- Device cache (newest 100 products) ----------
const CACHE = 'ww:off:'
const CACHE_INDEX = 'ww:off-index'
function cacheGet(code: string): OffProduct | null {
  try { const v = localStorage.getItem(CACHE + code); return v ? JSON.parse(v) : null } catch { return null }
}
function cachePut(code: string, p: OffProduct) {
  try {
    const index: string[] = JSON.parse(localStorage.getItem(CACHE_INDEX) ?? '[]').filter((c: string) => c !== code)
    index.unshift(code)
    for (const old of index.splice(100)) localStorage.removeItem(CACHE + old)
    localStorage.setItem(CACHE + code, JSON.stringify(p))
    localStorage.setItem(CACHE_INDEX, JSON.stringify(index))
  } catch { /* storage full or blocked: just not cached */ }
}

// ---------- Throttle: stay under Open Food Facts' per-person limits ----------
const lookups: number[] = []
const searches: number[] = []
function allow(times: number[], max: number) {
  const now = Date.now()
  while (times.length && now - times[0] > 60_000) times.shift()
  if (times.length >= max) return false
  times.push(now)
  return true
}

export async function lookupBarcode(code: string): Promise<LookupResult> {
  const cached = cacheGet(code)
  if (cached) return { ok: true, product: fromOff(cached, code), cached: true }
  if (!navigator.onLine) return { ok: false, reason: 'offline' }
  if (!allow(lookups, 12)) return { ok: false, reason: 'busy' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const res = await fetch(`${API}/${code}.json?fields=${OFF_FIELDS}`, { headers: { 'X-User-Agent': APP_ID }, signal: ctrl.signal })
    if (res.status === 404) return { ok: false, reason: 'not_found' }
    if (res.status === 429 || res.status === 503) return { ok: false, reason: 'busy' }
    if (!res.ok) return { ok: false, reason: 'error' }
    const body = await res.json() as { status?: number; product?: OffProduct }
    if (body.status !== 1 || !body.product) return { ok: false, reason: 'not_found' }
    cachePut(code, body.product)
    return { ok: true, product: fromOff(body.product, code), cached: false }
  } catch {
    return { ok: false, reason: navigator.onLine ? 'error' : 'offline' }
  } finally {
    clearTimeout(timer)
  }
}

export type SearchResult = { ok: true; products: Packaged[] } | { ok: false; message: string }

export async function searchPackaged(query: string): Promise<SearchResult> {
  if (!navigator.onLine) return { ok: false, message: 'No connection. Packaged search needs signal; try the barcode later, or type from the label.' }
  if (!allow(searches, 8)) return { ok: false, message: 'That’s a lot of searches in a minute. Wait a moment, or scan the barcode.' }
  const { data, error } = await supabase.functions.invoke('food-search', { body: { q: query } })
  if (error) {
    let message = 'Couldn’t search packaged foods. Try again in a minute.'
    if (error instanceof FunctionsHttpError) {
      try { message = (await error.context.json()).message ?? message } catch { /* keep the default */ }
    }
    return { ok: false, message }
  }
  const products = (data?.products ?? []) as OffProduct[]
  return { ok: true, products: rankPackaged(products.map((p) => fromOff(p))).slice(0, 10) }
}
