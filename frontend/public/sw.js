const SHELL_CACHE = 'waheed-shell-v1';
const STATIC_CACHE = 'waheed-static-v1';
const ALL_CACHES = [SHELL_CACHE, STATIC_CACHE];

// Install: activate immediately without waiting
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate: delete old caches from previous versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET from same origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API routes: network only — offline API support is Phase 2
  if (url.pathname.startsWith('/api/')) return;

  // /_next/static/: cache-first (filenames are hashed = immutable)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // HTML pages: network-first, fall back to cached version when offline
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
