/**
 * Service Worker – Cache-First für App-Shell, Network-First für Sync
 * Version im Cache-Namen erhöhen, um alten Cache zu invalidieren
 */

const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `nebeneinkuenfte-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `nebeneinkuenfte-dynamic-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'src/styles/main.css',
  'src/app.js',
  'src/services/store.js',
  'src/services/storage.js',
  'src/services/calculations.js',
  'src/services/export.js',
  'src/services/sync.js',
  'src/components/dashboard.js',
  'src/components/assignments.js',
  'src/components/clients.js',
  'src/components/analytics.js',
  'src/components/settings.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
];

// Install: Pre-cache alle statischen Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: Alte Caches bereinigen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: Cache-First für statische Assets, Network-First für API-Calls
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // GitHub Gist API: Network-First (Sync braucht aktuelle Daten)
  if (url.hostname === 'api.github.com') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Alles andere: Cache-First
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline – keine zwischengespeicherte Version verfügbar.', {
      status: 503,
    });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Netzwerk nicht erreichbar.', { status: 503 });
  }
}
