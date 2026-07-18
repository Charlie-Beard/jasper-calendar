// Shell files are served stale-while-revalidate: instant launch from cache,
// refreshed in the background — so an update appears on the NEXT launch with
// no cache-version bump needed. Bump CACHE only to force-flush everything.
const CACHE = 'jasper-v18';

const SHELL = [
  '/',
  '/css/style.css',
  '/js/api.js',
  '/js/calendar.js',
  '/js/day-types.js',
  '/js/outbox.js',
  '/js/version.js',
  '/manifest.webmanifest',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function putInCache(request, res) {
  if (res && res.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, res.clone());
  }
  return res;
}

// Data (/api/*, /version.json): network first, so it's always fresh; cached
// copy only as an offline fallback.
async function networkFirst(request) {
  try {
    return await putInCache(request, await fetch(request));
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

// Shell: answer from cache immediately, refresh the cached copy in the
// background so the next launch gets any update.
async function staleWhileRevalidate(event, request) {
  const cached = await caches.match(request);
  const refresh = fetch(request).then((res) => putInCache(request, res));
  if (cached) {
    event.waitUntil(refresh.catch(() => {})); // offline refresh failure is fine
    return cached;
  }
  return refresh;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const fresh = url.pathname.startsWith('/api/') || url.pathname === '/version.json';
  e.respondWith(fresh ? networkFirst(e.request) : staleWhileRevalidate(e, e.request));
});
