/* Lite Service Worker - v1.0.0 */
const CACHE_NAME = 'lite-cache-v1.0.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  'https://sazzadcheju49.github.io/portal-app/portalBridge.js?v=1',
  'https://sazzadcheju49.github.io/portal-app/dataSync.js?v=1'
];

// Install: precache core shell assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

// Activate: purge older version caches and claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Allow waiting worker to skipWaiting when user taps "Tap to refresh"
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Fetch routing
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Non-negotiable Rule #5: app-registry.json MUST ALWAYS be fetched fresh over the network,
  // falling back to cache only if network fails.
  if (url.pathname.endsWith('app-registry.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});
