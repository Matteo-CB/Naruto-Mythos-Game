const CACHE_VERSION = 'nm-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const KNOWN_CACHES = new Set([STATIC_CACHE, IMAGE_CACHE, RUNTIME_CACHE]);

const ALWAYS_NETWORK_PATHS = [
  '/api/',
  '/socket.io/',
  '/_next/data/',
  '/_next/image',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !KNOWN_CACHES.has(k)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function shouldBypass(url) {
  if (url.origin !== self.location.origin) return true;
  for (const p of ALWAYS_NETWORK_PATHS) {
    if (url.pathname.startsWith(p)) return true;
  }
  return false;
}

function isImmutableAsset(url) {
  if (url.pathname.startsWith('/_next/static/')) return true;
  if (url.pathname.startsWith('/fonts/')) return true;
  if (url.pathname.startsWith('/icons/')) return true;
  if (url.pathname.startsWith('/images/cards/')) return true;
  return false;
}

function isImage(url) {
  return url.pathname.startsWith('/images/');
}

function isHtmlNavigation(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await networkPromise) || fetch(request);
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (shouldBypass(url)) return;

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request, isImage(url) ? IMAGE_CACHE : STATIC_CACHE));
    return;
  }

  if (isImage(url)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  if (isHtmlNavigation(request)) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
