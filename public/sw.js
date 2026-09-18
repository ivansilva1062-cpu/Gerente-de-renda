/*
 * Network-only service worker with enhancement for Web Push notifications.
 * No financial, session, API, or page response is cached locally.
 */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})

self.addEventListener('push', (event) => {
  const payload = event.data && event.data.text ? JSON.parse(event.data.text()) : null
  const title = payload?.title || 'Gerente de Renda'
  const body = payload?.body || 'Há uma atualização importante.'
  const url = payload?.data?.url || '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: payload?.tag || 'gerente-notification',
      icon: payload?.icon || '/apple-icon.png',
      badge: payload?.badge || '/icon.svg',
      data: { url },
      vibrate: [150, 100, 150],
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.preventDefault()

  const targetUrl = event.notification?.data?.url || '/'
  const clientUrl = targetUrl.startsWith('http') ? targetUrl : new URL(targetUrl, self.location.origin).toString()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes('/')) {
          return client.focus().then(() => client.postMessage({ type: 'notification-click', url: clientUrl }))
        }
      }

      return self.clients.openWindow(clientUrl)
    }),
  )
})