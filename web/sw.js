const CACHE_NAME = 'senandung-cache-v1';
const AUDIO_CACHE = 'senandung-audio-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/sync.js',
  '/js/audio.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME && k !== AUDIO_CACHE) {
            return caches.delete(k);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Jika request stream audio yang sudah disimpan offline
  if (url.pathname.startsWith('/api/stream/')) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(e.request.url);
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(e.request);
      })
    );
    return;
  }

  // Aset statis & API cache-first / network-fallback
  e.respondWith(
    caches.match(e.request).then((res) => {
      return (
        res ||
        fetch(e.request).then((fetchRes) => {
          // Jangan cache endpoint API dinamis selain covers
          if (url.pathname.startsWith('/api/covers/')) {
            const clone = fetchRes.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return fetchRes;
        })
      );
    })
  );
});
