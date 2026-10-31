// Added to the app's service worker (vite.config.ts → workbox.importScripts). TF-20 phone reminders.
// Shows a reminder sent by supabase/functions/send-reminders, and opens the right tab when it's tapped.

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  event.waitUntil(self.registration.showNotification(data.title || 'Whey & Weights', {
    body: data.body || '',
    tag: data.tag || 'reminder',          // a newer reminder of the same kind replaces the old one
    icon: new URL('pwa-192x192.png', self.registration.scope).href,
    badge: new URL('pwa-64x64.png', self.registration.scope).href,
    data: { url: data.url || self.registration.scope },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data && event.notification.data.url || '', self.registration.scope).href
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of open) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus()
        if ('navigate' in c) await c.navigate(url).catch(() => {})
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
