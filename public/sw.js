const CACHE_NAME = 'zion-v5'

// Only cache static assets — never HTML pages (they reference versioned JS chunks)
const STATIC_EXTENSIONS = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2']

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('supabase')) return

  const url = new URL(event.request.url)

  // API routes: never cache
  if (url.pathname.startsWith('/api/')) return

  // HTML pages: always fetch from network (so deploys are picked up immediately)
  const isStaticAsset = STATIC_EXTENSIONS.some(ext => url.pathname.endsWith(ext)) ||
    url.pathname.startsWith('/_next/static/')

  if (!isStaticAsset) {
    // Network only for HTML pages
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    )
    return
  }

  // Static assets: network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        return response
      })
      .catch(() => caches.match(event.request))
  )
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  const title = data.title || 'Zion'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
