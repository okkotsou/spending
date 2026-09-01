/*
 * Misraf service worker.
 *
 * Strategy:
 *   - Precache the hashed app shell at install so a cold, offline start works.
 *   - Navigations are served from the cached shell (the app is a single page
 *     with hash routing, so the shell answers every route).
 *   - Same-origin static assets are cache-first; they are content-hashed, so a
 *     cached copy is never stale.
 *   - Anything else falls through to the network untouched.
 *
 * There is no runtime network dependency: all application data lives in
 * IndexedDB on the device.
 */
const PRECACHE = __PRECACHE_MANIFEST__;
const REVISION = __CACHE_REVISION__;
const APP_SHELL = __APP_SHELL__;
const CACHE_NAME = 'misraf-' + REVISION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: false });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function navigationHandler(request) {
  try {
    return await fetch(request);
  } catch {
    const shell = await caches.match(APP_SHELL);
    if (shell) return shell;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  event.respondWith(cacheFirst(request).catch(() => caches.match(request).then((r) => r || Response.error())));
});
