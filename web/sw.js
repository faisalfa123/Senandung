const CACHE_NAME = 'senandung-cache-v3';
const AUDIO_CACHE = 'senandung-audio-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
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
            console.log('[SW] Menghapus cache lama:', k);
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

  // 1. Audio Stream: Cek cache offline terlebih dahulu jika disimpan
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

  // 2. Navigasi & HTML: Network-First (Selalu ambil HTML terbaru dari server, fallback ke cache jika offline)
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return networkRes;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // 3. API dinamis: Jangan pernah cache API query
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // 4. Aset statis lainnya (gambar/icons)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return (
        cached ||
        fetch(e.request).then((fetchRes) => {
          if (fetchRes && fetchRes.status === 200) {
            const clone = fetchRes.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return fetchRes;
        })
      );
    })
  );
});
