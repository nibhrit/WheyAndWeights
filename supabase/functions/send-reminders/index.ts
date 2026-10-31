// send-reminders: phone reminders (TF-20) via Web Push.
//
// POST, three uses:
//   { action: "run" }  with header x-cron-secret = CRON_SECRET   → the 15-minute job (pg_cron, supabase/cron/reminders.sql):
//                       for each person, reminders that are due, not sent today, and still relevant → push to their devices
//   { action: "key" }  signed-in user → { publicKey } (the VAPID public key the app subscribes with)
//   { action: "test" } signed-in user → a test notification to their own devices
//
// Deploy with "Verify JWT" OFF: the cron call has no user token. This function checks the cron secret or the user's
// token itself. Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET, optional VAPID_SUBJECT.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { dueKinds, localNow, messageFor, type Facts, type Kind, type Settings } from './shared.ts'

const PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'https://github.com/nibhrit/WheyAndWeights'
if (PUBLIC_KEY && PRIVATE_KEY) webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)

// Service role: reads everyone's settings and data for the checks; never sent to a browser
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (status: number, error: string, message: string) => json(status, { error, message })

// Constant-time comparison, so the secret can't be guessed from response timing
function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string }

// Push to every device of a person; devices the push service says are gone (404/410) are removed
async function pushTo(subs: Sub[], payload: unknown) {
  let delivered = 0
  let removed = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 })
      delivered++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) { await admin.from('push_subscriptions').delete().eq('id', s.id); removed++ }
      else console.error('push', status, (e as Error).message)
    }
  }
  return { delivered, removed }
}

async function factsFor(userId: string, date: string): Promise<Facts> {
  const [food, goal, split, lift, cardio] = await Promise.all([
    admin.from('protein_entries').select('grams').eq('user_id', userId).eq('local_date', date),
    admin.from('protein_goals').select('goal_g').eq('user_id', userId).lte('effective_from', date).order('effective_from', { ascending: false }).limit(1),
    admin.from('daily_splits').select('groups').eq('user_id', userId).eq('date', date).maybeSingle(),
    admin.from('lift_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('local_date', date),
    admin.from('cardio_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('local_date', date),
  ])
  const rows = (food.data ?? []) as { grams: number }[]
  return {
    foods: rows.length,
    protein: rows.reduce((n, r) => n + r.grams, 0),
    goal: (goal.data?.[0] as { goal_g: number } | undefined)?.goal_g ?? 100,
    planned: ((split.data as { groups: string[] } | null)?.groups ?? []).length > 0,
    trained: (lift.count ?? 0) + (cardio.count ?? 0) > 0,
  }
}

async function run() {
  const { data: people, error } = await admin.from('reminder_settings').select('user_id,time_zone,food_on,food_at,protein_on,protein_at,workout_on,workout_at')
  if (error) { console.error('settings', error.message); return { error: 'settings' } }
  const result = { people: people.length, sent: 0, skipped: 0, removed: 0 }
  for (const p of people as (Settings & { user_id: string })[]) {
    let local
    try { local = localNow(p.time_zone) } catch { local = localNow('Asia/Kolkata') }   // a bad zone name falls back to IST
    const { data: log } = await admin.from('reminder_log').select('kind').eq('user_id', p.user_id).eq('local_date', local.date)
    const due = dueKinds(p, local.minutes, ((log ?? []) as { kind: Kind }[]).map((l) => l.kind))
    if (!due.length) continue
    const { data: subs } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', p.user_id)
    if (!subs?.length) continue
    const facts = await factsFor(p.user_id, local.date)
    for (const kind of due) {
      const message = messageFor(kind, facts)
      if (!message) { result.skipped++; continue }   // already done: no reminder (checked again next run, within the window)
      // Claim it first (one row per person, kind and day), so two overlapping runs can't both send it
      const { error: claimed } = await admin.from('reminder_log').insert({ user_id: p.user_id, kind, local_date: local.date })
      if (claimed) continue
      const r = await pushTo(subs as Sub[], message)
      result.removed += r.removed
      if (r.delivered) result.sent++
      else await admin.from('reminder_log').delete().eq('user_id', p.user_id).eq('kind', kind).eq('local_date', local.date)   // retry next run
    }
  }
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail(405, 'bad_request', 'Use POST.')
  let action = ''
  try { action = String((await req.json()).action ?? '') } catch { /* handled below */ }

  if (action === 'run') {
    if (!sameSecret(req.headers.get('x-cron-secret') ?? '', CRON_SECRET)) return fail(401, 'unauthorized', 'Not allowed.')
    if (!PUBLIC_KEY || !PRIVATE_KEY) return fail(503, 'not_configured', 'VAPID keys are not set.')
    return json(200, await run())
  }

  // Signed-in users: get the public key, or send themselves a test
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth, error: authError } = token ? await admin.auth.getUser(token) : { data: null, error: true }
  if (authError || !auth?.user || auth.user.is_anonymous) return fail(401, 'unauthorized', 'Sign in to set up reminders.')
  if (!PUBLIC_KEY || !PRIVATE_KEY) return fail(503, 'not_configured', 'Reminders aren’t set up on the server yet.')

  if (action === 'key') return json(200, { publicKey: PUBLIC_KEY })
  if (action === 'test') {
    const { data: subs } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', auth.user.id)
    if (!subs?.length) return fail(404, 'no_devices', 'Turn reminders on for this device first.')
    const r = await pushTo(subs as Sub[], { title: 'Reminders are on', body: 'This is how reminders will look.', url: '/WheyAndWeights/', tag: 'test' })
    return json(200, r)
  }
  return fail(400, 'bad_request', 'Unknown action.')
})
