import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Phone reminders (TF-20): subscribing this device to Web Push and saving it, so supabase/functions/send-reminders
// can reach it. Each device (phone, laptop) has its own subscription; settings (which reminders, when) are per person.

export type Support = 'ok' | 'install' | 'unsupported'

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

// iPhone only allows notifications for apps added to the Home Screen (iOS 16.4+)
export function pushSupport(): Support {
  if (isIos() && !isInstalled()) return 'install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return 'ok'
}

export const permission = () => ('Notification' in window ? Notification.permission : 'denied')

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

async function invoke(action: 'key' | 'test'): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; message: string }> {
  const { data, error } = await supabase.functions.invoke('send-reminders', { body: { action } })
  if (!error) return { ok: true, data }
  let message = 'Couldn’t reach the reminder service. Check your connection.'
  if (error instanceof FunctionsHttpError) {
    try { message = (await error.context.json()).message ?? message } catch { /* keep the default */ }
  }
  return { ok: false, message }
}

// The VAPID public key comes as base64url; the browser wants bytes
function keyBytes(base64url: string) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

const deviceName = () => (isIos() ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'Browser')

// Must run from a tap (iPhone asks for permission only then). Returns an error message, or null when on.
export async function enableReminders(): Promise<string | null> {
  if (pushSupport() !== 'ok') return 'Reminders aren’t available here.'
  const result = await Notification.requestPermission()
  if (result !== 'granted') {
    return isIos()
      ? 'Notifications are off for this app. iPhone: Settings → Notifications → Whey&Weights → Allow, then try again.'
      : 'Notifications are blocked for this site. Allow them in the browser’s site settings, then try again.'
  }
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const key = await invoke('key')
    if (!key.ok) return key.message
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(String(key.data.publicKey)) })
    } catch {
      return 'Couldn’t turn on notifications on this device. Try again.'
    }
  }
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, device: deviceName() },
    { onConflict: 'endpoint' },
  )
  if (error) return 'Couldn’t save this device. Try again.'
  // Make sure settings exist (defaults: all three on), and record this device's time zone
  const { error: sErr } = await supabase.from('reminder_settings').upsert(
    { time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata' }, { onConflict: 'user_id' },
  )
  return sErr ? 'Couldn’t save your reminder settings. Try again.' : null
}

export async function disableReminders(): Promise<string | null> {
  const sub = await currentSubscription()
  if (!sub) return null
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe().catch(() => {})
  return error ? 'Couldn’t turn reminders off. Try again.' : null
}

export async function sendTest(): Promise<string> {
  const r = await invoke('test')
  return r.ok ? 'Sent. It should arrive in a few seconds.' : r.message
}

export type ReminderSettings = {
  food_on: boolean; food_at: string
  protein_on: boolean; protein_at: string
  workout_on: boolean; workout_at: string
}

export async function loadReminderSettings(): Promise<ReminderSettings | null> {
  const { data } = await supabase.from('reminder_settings').select('food_on,food_at,protein_on,protein_at,workout_on,workout_at').maybeSingle()
  return (data as ReminderSettings | null) ?? null
}

export async function saveReminderSettings(patch: Partial<ReminderSettings>): Promise<string | null> {
  const { error } = await supabase.from('reminder_settings').upsert(
    { ...patch, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata', updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  return error ? 'Couldn’t save. Check your connection and try again.' : null
}
