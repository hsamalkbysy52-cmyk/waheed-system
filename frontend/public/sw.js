const SHELL_CACHE = 'waheed-shell-v2';
const STATIC_CACHE = 'waheed-static-v2';
const ALL_CACHES = [SHELL_CACHE, STATIC_CACHE];

self.addEventListener('install', () => {
  self.skipWaiting();
});

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

  // API routes: network only
  if (url.pathname.startsWith('/api/')) return;

  // Next.js App Router internals — never intercept these.
  // Includes RSC payloads, prefetch data, router state, HMR, etc.
  if (url.pathname.startsWith('/_next/') && !url.pathname.startsWith('/_next/static/')) return;

  // RSC navigation requests sent by Next.js App Router client-side navigation.
  // Intercepting these would serve wrong cached content and break tab switching.
  if (request.headers.get('RSC') || request.headers.get('Next-Router-State-Tree') || request.headers.get('Next-Router-Prefetch')) return;

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

  // Full HTML page loads: network-first, fall back to cache when offline
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
