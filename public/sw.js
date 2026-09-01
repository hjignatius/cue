// Hand-written service worker for Cue — offline launch + user-controlled updates.
// No libraries. Bump CACHE on each deploy to trigger the update flow. A new
// worker WAITS after install; it activates only when the page posts SKIP_WAITING
// (a user tap on "Update Cue"), so a live performance is never reloaded — and the
// old cache is evicted only then, so a running session never loses a lazy chunk.

const CACHE = 'cue-v24';

// App shell + icons. NOT the hashed JS/CSS (names unknown here — cached at
// runtime on first online launch) and NOT cue-icon-square.svg (unreferenced).
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/cue-192.png',
  '/cue-512.png',
  '/cue-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon-64.png',
  '/cue-icon.svg',
];

// The lazy pdfjs chunk + its worker are hashed assets whose names aren't known
// in this hand-written file, so they are INJECTED AT BUILD TIME by
// scripts/inject-sw-precache.mjs (it rewrites the array literal below using the
// real dist filenames). Precaching them means a PDF song renders with the
// network fully off even if no PDF was ever opened online first — the gig case.
// The array stays empty in dev (fine: runtime cache-fill still covers online use).
const PDF_PRECACHE = [];

self.addEventListener('install', (event) => {
  // No skipWaiting here — an update must wait for the user's tap.
  // PDF assets are best-effort: if a hashed name drifts, addAll would reject the
  // whole precache — so add the shell (must-have) first, then the pdfjs assets
  // in a catch-guarded pass so one stale name can't break offline launch.
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    await cache.addAll(PRECACHE_URLS);
    if (PDF_PRECACHE.length) {
      try { await cache.addAll(PDF_PRECACHE); } catch (e) { /* runtime cache-fill still covers it */ }
    }
  }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// The ONLY path to activating a waiting update: the page posts this on user tap.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;             // never touch writes / auth
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;  // Supabase, YouTube, etc. → network
  if (url.pathname.startsWith('/api/')) return;      // future serverless fns → never cache

  const isNavigation = request.mode === 'navigate'
    || (request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // Network-first so a fresh index.html wins online; the cached shell serves
    // offline. Covers every SPA route, including /shared/:token, when offline.
    // On a successful online fetch, refresh the cached shell so the NEXT launch
    // (including offline) serves the latest version last seen online — the update
    // lands on next launch, never mid-session, so a running set is undisturbed.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets (hashed JS/CSS, fonts, images): cache-first, then fill the
  // cache on first fetch so one online launch makes everything offline-ready.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
