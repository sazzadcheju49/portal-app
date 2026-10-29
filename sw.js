/**
 * Service Worker: Lite PWA
 * Version: lite-v1
 */
const CACHE_NAME = 'lite-v1';
const MAX_CACHE_ITEMS = 40;

const PRECACHE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon.svg',
  'https://sazzadcheju49.github.io/portal-app/portalBridge.js?v=1',
  'https://sazzadcheju49.github.io/portal-app/dataSync.js?v=1'
];

// Helper: Cap cache size to avoid unbounded storage usage
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    trimCache(cacheName, maxItems);
  }
}

// 1. Install: Precache core shell assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
});

// 2. Activate: Clean up only old 'lite-' caches, claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k.startsWith('lite-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Listen for manual skipWaiting message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Fetch Strategy: Cache-First, with app-registry.json strictly NETWORK-ONLY
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // RULE: app-registry.json is ALWAYS fetched fresh from network, NEVER cached
  if (url.pathname.endsWith('app-registry.json')) {
    return; // Pass through to network
  }

  // RULE: Never intercept cross-origin requests except precached shared scripts
  const isSameOrigin = url.origin === self.location.origin;
  const isSharedScript = url.href.includes('/portalBridge.js?v=1') || url.href.includes('/dataSync.js?v=1');
  if (!isSameOrigin && !isSharedScript) {
    return;
  }

  // Navigation Requests: use ignoreSearch so index.html?syncToken=...&autosync=1 works offline
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { ignoreSearch: true }).then((cached) => {
        return cached || fetch(request).catch(() => caches.match('./index.html', { ignoreSearch: true }));
      })
    );
    return;
  }

  // Static Assets: Cache-First with Network fallback
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clone);
          trimCache(CACHE_NAME, MAX_CACHE_ITEMS);
        });

        return networkResponse;
      });
    })
  );
});
