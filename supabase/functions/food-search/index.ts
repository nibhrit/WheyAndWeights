// food-search: searches Open Food Facts for packaged foods by name ("muscleblaze whey") for the Food tab (TF-38).
//
// Why a relay: search.openfoodfacts.org doesn't allow calls from a web page (no CORS), and Open Food Facts asks apps to
// identify themselves with a User-Agent, which browsers can't set. Barcode lookups don't need this: the app calls
// world.openfoodfacts.org directly.
//
// POST { q: string }  with the signed-in user's Authorization header (supabase.functions.invoke sends it)
// 200  { products: OffProduct[] }   raw records, trimmed to the fields the app reads (it ranks and checks them)
// 4xx/5xx { error: code, message }  codes: unauthorized, bad_query, busy, unavailable
//
// Limits: Open Food Facts allows 10 searches a minute; the app throttles itself to 8 and only searches on a button
// press. Data: Open Food Facts, ODbL (database) / DbCL (contents); nothing is stored here.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const SEARCH = 'https://search.openfoodfacts.org/search'
const FIELDS = 'code,product_name,product_name_en,brands,serving_size,serving_quantity,serving_quantity_unit,' +
  'product_quantity,product_quantity_unit,nutriments,countries_tags'
const KEEP = ['energy-kcal_100g', 'energy_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'fiber_100g', 'added-sugars_100g']
const USER_AGENT = 'WheyAndWeights/1.0 (https://github.com/nibhrit/WheyAndWeights)'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (status: number, error: string, message: string) => json(status, { error, message })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail(405, 'bad_query', 'Use POST.')

  // Signed-in users only
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth, error: authError } = token ? await admin.auth.getUser(token) : { data: null, error: true }
  if (authError || !auth?.user || auth.user.is_anonymous) return fail(401, 'unauthorized', 'Sign in to search packaged foods.')

  let q = ''
  try { q = String((await req.json()).q ?? '').replace(/\s+/g, ' ').trim() } catch { /* handled below */ }
  if (q.length < 3 || q.length > 80) return fail(400, 'bad_query', 'Type 3 to 80 characters.')

  const url = `${SEARCH}?q=${encodeURIComponent(q)}&page_size=24&langs=en&fields=${FIELDS}`
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) })
  } catch (e) {
    console.error('off search', e)
    return fail(503, 'unavailable', 'Open Food Facts didn’t answer. Try again, or scan the barcode.')
  }
  if (res.status === 429 || res.status === 503) return fail(503, 'busy', 'Open Food Facts is busy. Try again in a minute.')
  if (!res.ok) {
    console.error('off search status', res.status)
    return fail(503, 'unavailable', 'Couldn’t search Open Food Facts. Try again, or scan the barcode.')
  }
  const body = await res.json() as { hits?: Record<string, unknown>[] }
  // Keep only the nutrients the app reads, so the response stays small
  const products = (body.hits ?? []).map((h) => {
    const n = (h.nutriments ?? {}) as Record<string, unknown>
    return { ...h, nutriments: Object.fromEntries(KEEP.filter((k) => n[k] != null).map((k) => [k, n[k]])) }
  })
  return json(200, { products })
})
