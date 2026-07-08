// Resonant — app-shell service worker
// Caches the shell on install; serves it offline.
// API / WS requests are never cached (network-first by default).

const CACHE_NAME = 'resonant-shell-v28';

// The minimum shell to cache for standalone installability.
// Vite builds assets with hashed names; we don't try to enumerate them here —
// instead we cache the root document and let the browser handle assets via
// normal HTTP caching. This SW's job is: installability + offline shell.
const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept: API, WS, cross-origin
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/ws') ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // For navigation requests: try network, fall back to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/').then((r) => r ?? fetch(request))
      )
    );
    return;
  }

  // For static assets: cache-first (Vite hashes ensure freshness)
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/apple-touch-icon.png'
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) => cached ?? fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
      )
    );
    return;
  }

  // Everything else: network-only
});
