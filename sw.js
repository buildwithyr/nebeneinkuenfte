/**
 * Service Worker – Cache-First für App-Shell
 *
 * WICHTIG: CDN-Assets (Chart.js) werden NICHT im Install-Schritt gecacht.
 * caches.addAll() schlägt atomar fehl wenn eine URL nicht erreichbar ist →
 * das würde den SW-Install in einer Endlosschleife wiederholen und die App einfrieren.
 *
 * Stattdessen: Lokale Assets werden im Install gecacht, externe Assets werden
 * beim ersten Fetch dynamisch gecacht (cache-first mit Network-Fallback).
 */

// WICHTIG: Gleich halten mit APP_VERSION in src/app.js (SW kann nicht importieren).
const CACHE_VERSION = 'v2.6.1';
const STATIC_CACHE  = `nebeneinkuenfte-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `nebeneinkuenfte-dynamic-${CACHE_VERSION}`;

// Nur lokale Dateien – kein CDN, keine externe URL
const LOCAL_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'src/styles/main.css',
  'src/app.js',
  'src/config.js',
  'src/services/store.js',
  'src/services/storage.js',
  'src/services/calculations.js',
  'src/services/export.js',
  'src/services/supabase.js',
  'src/services/authUtils.js',
  'src/services/csvImport.js',
  'src/services/sheetImport.js',
  'src/services/db.js',
  'src/components/importModal.js',
  'src/components/dashboard.js',
  'src/components/assignments.js',
  'src/components/clients.js',
  'src/components/analytics.js',
  'src/components/settings.js',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/vendor/chart.umd.js',
  'assets/vendor/supabase.umd.js',
];

// Install: Jede Datei einzeln cachen – ein Fehler blockiert nicht den Rest
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.allSettled(
        LOCAL_ASSETS.map((url) =>
          cache.add(url).catch((err) =>
            console.warn(`[SW] Cache miss für ${url}:`, err)
          )
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// Activate: Veraltete Caches löschen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: GitHub API immer über Netzwerk; alles andere Cache-First
self.addEventListener('fetch', (event) => {
  // Nicht-GET Requests nicht abfangen
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // GitHub API: Kein Caching – Sync muss aktuelle Daten sehen
  if (url.hostname === 'api.github.com') {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Nur erfolgreiche Responses cachen (verhindert gecachte Fehlermeldungen)
    if (response.ok && response.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response(
      'Offline – diese Ressource ist noch nicht im Cache.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }
}
