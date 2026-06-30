# CLAUDE.md – Nebeneinkünfte Tracker

## 1. Projekt-Übersicht

**Name:** Nebeneinkünfte Tracker  
**Zweck:** PWA zur Verwaltung von Mystery-Shopping-Aufträgen und Nebeneinkünften. Ersetzt eine Excel-Lösung (3 Jahre × 2 Sheets = 6 Sheets). Österreichischer Einzelnutzer, ~30 Aufträge/Jahr, iPhone + Firmenlaptop.

**Tech-Stack:**
- Vanilla JS (ES Modules, kein Framework, kein Build-Step)
- Supabase (Auth + Postgres + Realtime) als optionaler Cloud-Backend
- GitHub Gist als älterer optionaler Sync-Kanal (noch aktiv, parallel zu Supabase)
- Chart.js 4.4.4 (lokal in `assets/vendor/chart.umd.js`, kein CDN)
- Service Worker (Cache-First, v1.0.1)
- CSS Custom Properties (Dark/Light Mode, Mobile-First)

**Hosting:** GitHub Pages – `https://buildwithyr.github.io/nebeneinkuenfte/`  
Kein Build-Step. Statische Dateien direkt aus dem Repo-Root.

---

## 2. Dateistruktur

```
nebeneinkuenfte/
├── index.html              # App-Shell, lädt alle ES-Module
├── manifest.json           # PWA Manifest (shortcuts, icons)
├── sw.js                   # Service Worker (Cache-First, Promise.allSettled)
├── .nojekyll               # GitHub Pages: kein Jekyll
├── package.json            # type:module, test:node --test, deps: supabase-js + sharp
├── supabase/
│   └── schema.sql          # DB-Schema (clients, assignments, user_settings + RLS + Realtime)
├── assets/
│   ├── icons/              # icon-192/512.png + apple-touch-icon (einfarbige Platzhalter)
│   └── vendor/
│       └── chart.umd.js    # Chart.js (205KB, unminifiziert – bewusst lokal statt CDN)
├── src/
│   ├── app.js              # App-Controller: Navigation, Toast, SW-Registrierung
│   ├── components/
│   │   ├── dashboard.js    # Dashboard + Monatschart
│   │   ├── assignments.js  # Aufträge-CRUD + Modal
│   │   ├── clients.js      # Auftraggeber-CRUD + Modal
│   │   ├── analytics.js    # Berichte (4 Tabs, Donut-Chart)
│   │   └── settings.js     # Einstellungen (KEIN store.on-Listener – absichtlich!)
│   └── services/
│       ├── store.js        # Zentraler State (Pub/Sub, localStorage-backed)
│       ├── storage.js      # localStorage-Wrapper
│       ├── calculations.js # AT-Steuer § 33 EStG, km-Geld, Aggregationen
│       ├── sync.js         # GitHub Gist Sync (push/pull/sync, manuell)
│       ├── supabase.js     # Supabase-Client (URL + publishable key hardcoded)
│       ├── db.js           # Supabase DB-Operationen (CRUD für clients/assignments)
│       ├── export.js       # JSON Export/Import, CSV Export
│       └── styles/
│           └── main.css    # Alle Styles (Design-Tokens, Dark/Light, iOS safe-area)
└── test/
    └── calculations.test.js  # Node --test (Steuerlogik)
```

---

## 3. Aktueller Stand

### Fertig & stabil
- Dashboard, Aufträge-CRUD, Auftraggeber-CRUD, Berichte, Einstellungen
- PWA (offline, installierbar auf iOS + Desktop)
- GitHub Gist Sync (manuell, Last-Write-Wins)
- Supabase-Integration: Auth (Magic Link / E-Mail), Realtime-Sync zwischen Geräten, automatische Cloud-Speicherung
- Steuerberechnung (AT § 33 EStG, Grenzsteuersatz, Freigrenze § 41 Abs. 3, Einschleifregelung)
- 5 kritische Bugs behoben (siehe PROJECT_STATE.md → „Behobene Probleme")

### In Arbeit / unklar
- Zwei Sync-Systeme (Gist + Supabase) existieren parallel – unklar ob das eine das andere ersetzen soll oder beide aktiv bleiben
- `sync.js` enthält noch Debug-`console.log`-Blöcke aus dem „Token-Diagnose-Logging" (Commit `8c553a8`) – sollten raus
- GitHub Pages Deployment: Branch `claude/youthful-ride-2hfPf` ist laut PROJECT_STATE.md noch nicht als Default-Branch gesetzt und GitHub Pages noch nicht aktiviert (Stand 2026-05-29 – aktueller Status unklar)

### Bekannt offen
- App-Icons sind einfarbige Platzhalter-PNGs (nicht PWA-konform)
- `chart.umd.js` ist unminifiziert (205KB, minifiziert wären ~70KB)
- Zirkulärer Import: `assignments.js` importiert `showToast` aus `app.js`, `app.js` importiert `assignments.js` – funktioniert zufällig

---

## 4. Technische Konventionen

### View-Pattern (Pflicht bei jeder Komponente)
```js
export function renderX(container) {
  _render(container);
  const unsub = store.on('event', () => _render(container));
  container._xUnsub = () => unsub();
}
export function destroyX(container) {
  container._xUnsub?.();
  // Chart zerstören, document-Listener entfernen
}
```
`navigate()` in `app.js` ruft immer `destroyX` vor dem Wechsel auf – ohne `destroyX` = Memory Leak / Event-Listener-Leak.

### Settings-Komponente: KEIN store.on-Listener
`settings.js` registriert absichtlich **keinen** `store.on('settings')`-Listener. Jede Settings-Änderung würde sonst `_render(container)` triggern → vollständiger DOM-Rebuild → Fokus-Verlust beim Tippen. Settings speichert auf `blur`/`Enter`, aktualisiert gezielt einzelne DOM-Elemente.

### CSS
- Alle Design-Tokens als CSS Custom Properties in `:root` (Dark) und `[data-theme="light"]`
- Mobile-First, Sidebar-Nav ab 640px
- `env(safe-area-inset-*)` für iPhone Notch

### localStorage Key
`nebeneinkuenfte_v1` – darin liegt das komplette Datenmodell als JSON.

### Tests
`node --test` (kein Jest, kein Vitest). Nur `test/calculations.test.js` – deckt die Steuerlogik ab.

---

## 5. Bekannte Eigenheiten & Stolpersteine

**Modal-Backdrop pointer-events (kritisch!)**  
```css
.modal-backdrop              { pointer-events: none; }
.modal-backdrop.visible      { pointer-events: auto; }
```
Ohne diesen Fix fängt das unsichtbare `position:fixed; inset:0; z-index:60` Backdrop alle Klicks ab → App wirkt eingefroren. Nicht anfassen.

**Service Worker: `Promise.allSettled` statt `caches.addAll()`**  
`addAll()` ist atomar – ein einzelner fehlgeschlagener Asset-Request lässt den kompletten SW-Install fehlschlagen → endloser Retry-Loop → CPU-Last. Immer `allSettled` verwenden.

**Kein `file://`-Protokoll**  
ES Modules + CORS = funktioniert nur über HTTP. Immer `python3 -m http.server 8080` oder `npx serve .` zum lokalen Testen.

**Debug-Logging in `sync.js`**  
`pull()` enthält `console.group('[Sync DEBUG]')` Blöcke aus dem Token-Diagnose-Fix (Commit `8c553a8`). Kein aktiver Bug, aber Produktions-Lärm – bei Gelegenheit entfernen.

**Supabase Key ist hardcoded in `src/services/supabase.js`**  
Das ist der publishable/anon key (kein Secret) – für Browser-Apps so korrekt. RLS schützt die Daten. Trotzdem: nicht versehentlich den Service-Role-Key reinkopieren.

**Zwei Sync-Systeme**  
GitHub Gist Sync (alt) und Supabase Realtime (neu) koexistieren. Ob Gist mittelfristig rausfliegt, ist offen.

**`sharp` in package.json**  
Node-Dependency für Bildverarbeitung (vermutlich Icon-Generierung). Wird für die App selbst nicht gebraucht – nur als Dev-Tool.

---

## 6. Was NICHT ohne Rückfrage geändert werden soll

| Bereich | Warum |
|---|---|
| `src/styles/main.css` – Modal-Backdrop `pointer-events` | Kritischer Bug-Fix, unsichtbar aber essenziell |
| `sw.js` – `Promise.allSettled` in Install-Handler | Verhindert endlosen SW-Retry-Loop |
| `src/services/calculations.js` – Steuer-Tarifstufen | Österreichisches Steuerrecht, getestet, heikle Zahlen |
| `src/services/store.js` – Pub/Sub + `_save()` Logik | Zentraler State, alle Views hängen dran |
| `src/services/supabase.js` – URL + Key | Supabase-Projekt-Konfiguration, Änderung bricht Auth/Realtime |
| `supabase/schema.sql` – RLS Policies | Sicherheitsrelevant, falsche Policy = Datenleck |
| `src/components/settings.js` – kein store.on-Listener | Ist kein Vergessen, ist ein bewusster Fix gegen Re-render-Storm |

---

## Offene Fragen (nicht geraten, sondern unklar)

- Soll GitHub Gist Sync langfristig durch Supabase Realtime ersetzt werden, oder bleiben beide aktiv?
- Ist GitHub Pages bereits live? (Laut PROJECT_STATE.md Stand 2026-05-29 noch nicht aktiviert)
- Welcher Branch ist aktuell der Default-Branch auf GitHub?

---

*Zuletzt aktualisiert: 2026-06-30 | Basis: Commit `00d4e1c`*
