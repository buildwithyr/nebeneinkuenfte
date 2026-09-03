# PROJECT_STATE.md

## Nebeneinkünfte Tracker – Vollständiger Projektstatus

> Erstellt für: Übergabe an neuen Claude-Code-Chat ohne Wissensverlust  
> Branch: `claude/youthful-ride-2hfPf`  
> Repository: `buildwithyr/nebeneinkuenfte`  
> Stand: 2026-05-29

---

## Projektziel

Ersatz einer Excel-Lösung (3 Jahres-Sheets × 2 = 6 Sheets) durch eine moderne Progressive Web App zur Verwaltung von Mystery Shopping / Testkäufen und allgemeinen Nebeneinkünften.

**Nutzer-Kontext:**

- Österreich, Nebeneinkünfte aus Mystery Shopping (~30 Aufträge/Jahr)
- Auftraggeber: Whitebox, Langl & Partner, Concertare, Market Mind, Mystery Agency
- Hauptberuf: ~~€33.000 netto (~~€46.000 brutto geschätzt)
- Geräte: iPhone + Firmenlaptop
- Hosting: GitHub Pages (kostenlos)
- Keine Frameworks, kein Backend, kein Build-Step

---

## Aktueller Funktionsumfang

### ✅ Implementiert und getestet

| Bereich             | Feature                                                                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**       | Einnahmen Jahr/Monat, Offene Zahlungen, km, Steuer-Schätzung, Rücklage, Monatschart (Chart.js), Auftraggeber-Verteilung, letzte Aufträge                                                  |
| **Aufträge**        | CRUD, Filter (Jahr/Auftraggeber/Zahlungsstatus), FAB, Modal-Formular, Bezahlt-Markierung                                                                                                  |
| **Auftraggeber**    | CRUD, Aktiv/Inaktiv, Umsatz-Statistik pro Auftraggeber                                                                                                                                    |
| **Berichte**        | 4 Tabs: Jahresübersicht, Monatsübersicht, Auftraggeber (Donut-Chart), Offene Zahlungen mit direkter Bezahlt-Markierung                                                                    |
| **Einstellungen**   | Grenzsteuersatz (AT § 33 EStG auto/manuell), Kilometergeld, Rücklagen-%, Hauptberufseinkommen, Theme, Währung, GitHub Gist Sync, JSON/CSV Export/Import, Cache leeren, Alle Daten löschen |
| **PWA**             | Service Worker, manifest.json, offline-fähig, iOS-installierbar (apple-mobile-web-app-capable)                                                                                            |
| **Dark/Light Mode** | CSS Custom Properties, Toggle im Header                                                                                                                                                   |
| **Sync**            | GitHub Gist (optional, PAT-basiert, nur manuell per Button, Dirty-Indikator)                                                                                                              |
| **Export**          | JSON Vollbackup, CSV (aktuelles Jahr / alle Jahre)                                                                                                                                        |
| **Import**          | JSON Restore                                                                                                                                                                              |

---

## Architekturentscheidungen

### Vanilla JS + ES Modules (kein Framework)

**Begründung:** ~30 Einträge/Jahr, kein Build-Step nötig, direkt auf GitHub Pages deploybar, langfristig wartbar ohne Dependency-Hell.

### Single Page App mit View-Switching

- Kein Router (zu wenig Views für Router-Overhead)
- `navigate(viewName)` in `app.js` zerstört alte View, rendert neue
- Jede View hat `renderX(container)` + `destroyX(container)`

### Store als Singleton (Pub/Sub)

- `src/services/store.js` ist zentraler Datenspeicher
- `store.on('assignments', fn)` / `store.on('settings', fn)` mit Unsubscribe-Return
- Kein globaler State außerhalb des Stores
- Jede Mutation ruft `_save()` (localStorage) und `_emit(event)` auf

### localStorage als primärer Speicher

- Einzige Abhängigkeit: Browser-localStorage
- Für ~30 Einträge/Jahr absolut ausreichend (<50KB)
- Kein IndexedDB, kein Cache API für Daten

### Kein Auto-Sync

- Sync **nur** auf expliziten Button-Klick
- Kein `setInterval`, kein Hintergrund-Fetch
- Begründung: Zuverlässigkeit > Komfort bei diesem Nutzungsvolumen

---

## Datenmodell

```json
{
  "version": "1.0",
  "meta": {
    "lastModified": "2026-05-29T00:00:00.000Z",
    "deviceId": "dev-xxx"
  },
  "settings": {
    "currency": "EUR",
    "currencySymbol": "€",
    "kmRate": 0.42,
    "reserveRate": 0.4,
    "primaryIncomeGross": 46000,
    "useAutomaticTaxRate": true,
    "manualTaxRate": 0.4,
    "theme": "dark",
    "gistId": "",
    "gistToken": "",
    "lastSyncAt": null
  },
  "clients": [
    {
      "id": "client-1",
      "name": "Whitebox",
      "note": "IQOS Mystery Shopping",
      "active": true,
      "createdAt": "ISO"
    }
  ],
  "assignments": [
    {
      "id": "asgn-xxx",
      "date": "2026-03-15",
      "clientId": "client-1",
      "description": "IQOS Flagship Store Wien",
      "fee": 35.0,
      "km": 42,
      "kmBillable": true,
      "paid": true,
      "paidDate": "2026-04-01",
      "note": "",
      "type": "mystery_shopping",
      "createdAt": "ISO",
      "updatedAt": "ISO"
    }
  ]
}
```

**Designentscheidung:** Einheitliches Datenmodell (kein Jahr-Splitting wie in Excel). Jahres-/Monatssichten entstehen durch Filter in `calculations.js`.

**localStorage Key:** `nebeneinkuenfte_v1`

---

## Synchronisationskonzept

### Gewählt: GitHub Gist (optional)

**Warum Gist statt Alternativen:**

- Google Sheets: OAuth-Komplexität, Google-Account-Pflicht
- GitHub Repository: Zu komplex für JSON-Datei
- Lokales Backup: Kein Sync zwischen Geräten
- Gist: Kostenlos, privat, REST API, nur `gist`-Scope im PAT nötig

**Datei im Gist:** `nebeneinkuenfte-data.json`

**Konfliktlösung:** Last-Write-Wins via `meta.lastModified` Timestamp. Bei ~30 Einträgen/Jahr und 2 Geräten ausreichend (kein gleichzeitiges Bearbeiten erwartet).

**Setup für Nutzer:**

1. GitHub → Settings → Developer settings → Personal Access Tokens → Scope: `gist`
2. In App: Einstellungen → Token eintragen → „Neuen Gist anlegen"
3. Danach: „Jetzt synchronisieren" auf beiden Geräten

**Dirty-Indikator:** Wenn `meta.lastModified > settings.lastSyncAt` → gelbe Warnung in Einstellungen.

---

## PWA-Konzept

### Service Worker (`sw.js`)

- **Cache-Strategie:** Cache-First für lokale Assets, direktes Netzwerk für GitHub API
- **Install:** `Promise.allSettled` (kein atomares Fehlschlagen bei einzelnem Cache-Miss)
- **Activate:** Alte Cache-Versionen löschen via Version im Cache-Namen (`v1.0.1`)
- **Cache-Name:** `nebeneinkuenfte-static-v1.0.1` / `nebeneinkuenfte-dynamic-v1.0.1`
- **Chart.js:** Lokal in `assets/vendor/chart.umd.js`, im Static Cache

### Manifest (`manifest.json`)

- `display: standalone`
- `orientation: portrait-primary`
- Shortcuts: „Neuer Auftrag" → `?view=assignments&action=new`
- Icons: einfache PNG (192×192, 512×512) in `assets/icons/`

### iOS-Support

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Nebeneink." />
<link rel="apple-touch-icon" href="assets/icons/icon-192.png" />
```

---

## Steuerlogik

**Datei:** `src/services/calculations.js`

### Österreichische ESt-Tarifstufen 2024/2025 (§ 33 EStG)

| Einkommensbereich    | Steuersatz |
| -------------------- | ---------- |
| €0 – €12.816         | 0 %        |
| €12.816 – €20.818    | 20 %       |
| €20.818 – €34.513    | 30 %       |
| €34.513 – €66.612    | 40 %       |
| €66.612 – €99.266    | 48 %       |
| €99.266 – €1.000.000 | 50 %       |
| > €1.000.000         | 55 %       |

### Berechnungsmethode

```
taxOnPrimary = calcAustrianTax(primaryIncomeGross)
taxOnTotal   = calcAustrianTax(primaryIncomeGross + sideIncomeNet)
additionalTax = taxOnTotal - taxOnPrimary
```

**Berücksichtigt:** Progression (Grenzsteuersatz)  
**Nicht berücksichtigt:** SV-Beiträge, Werbungskosten, Sonderausgaben, Pendlerpauschale

### Kilometergeld

```
kmMoney = billableKm × kmRate (Standard: €0,42/km)
taxableIncome = totalFee - kmMoney
```

**Alle Steuer-Werte sind als Schätzung / Richtwert gekennzeichnet. Keine Steuerberatung.**

---

## Deployment-Konzept

### GitHub Pages

- Statische Dateien direkt aus Repository-Root
- `.nojekyll` verhindert Jekyll-Verarbeitung
- Alle Pfade relativ (`./`, `src/...`, `assets/...`)
- Kein Build-Step erforderlich

### Setup (einmalig)

1. Repository auf GitHub: `buildwithyr/nebeneinkuenfte`
2. Branch `claude/youthful-ride-2hfPf` als Default-Branch setzen (aktuell kein `main`)
3. GitHub → Settings → Pages → Source: Deploy from branch → Branch wählen → `/` (root)
4. App ist erreichbar unter: `https://buildwithyr.github.io/nebeneinkuenfte/`

### Lokale Entwicklung

```bash
python3 -m http.server 8080
# oder:
npx serve .
```

→ `http://localhost:8080`

**WICHTIG:** File-Protocol (`file://`) funktioniert nicht (ES Module CORS-Restriction).

---

## GitHub-Konfiguration

| Parameter      | Wert                                                                                   |
| -------------- | -------------------------------------------------------------------------------------- |
| Repository     | `buildwithyr/nebeneinkuenfte`                                                          |
| Aktiver Branch | `claude/youthful-ride-2hfPf`                                                           |
| Main-Branch    | **existiert nicht** (muss noch angelegt oder dieser Branch als Default gesetzt werden) |
| GitHub Pages   | noch nicht aktiv (kein Default-Branch)                                                 |
| Commits        | 3 (initial, SW-Fix, Haupt-Bug-Fix)                                                     |

---

## Behobene Probleme (mit Beweis)

### Bug 1: App reagiert nach Aufträge-View nicht mehr

**Symptom:** Nach Navigation zu „Aufträge" reagiert die App auf keine Klicks mehr (ca. 5-30 Sekunden scheinbarer Freeze).  
**Ursache:** `.modal-backdrop` hatte `pointer-events: auto` (CSS-Standard) obwohl es `opacity: 0` war. Mit `position: fixed; inset: 0; z-index: 60` lag es über der gesamten Seite inkl. Navigation (`z-index: 50`) und schluckte alle Klicks.  
**Beweis (Playwright-Messung):**

```
Vorher: assignments→analytics = 30.000ms (Playwright timeout)
Nachher: assignments→analytics = 533ms
```

**Fix:** `pointer-events: none` auf `.modal-backdrop` (default), `pointer-events: auto` nur auf `.modal-backdrop.visible`

### Bug 2: SW Install-Loop

**Symptom:** Service Worker schlägt endlos fehl, CPU-Last steigt.  
**Ursache:** `caches.addAll()` ist atomar – ein Fehler bei der externen CDN-URL (Chart.js) ließ den ganzen Install fehlschlagen. Browser wiederholte Installation endlos.  
**Fix:** `Promise.allSettled` statt `addAll`, Chart.js lokal gebundelt (`assets/vendor/chart.umd.js`).

### Bug 3: Settings-Re-render-Storm

**Symptom:** Bei Tippen in Einstellungsfeldern verliert man den Fokus alle 600ms.  
**Ursache:** `store.on('settings', () => _render(container))` im Settings-Component ersetzte bei jedem debounced Speichern das gesamte `innerHTML`.  
**Fix:** Listener entfernt. Settings speichern auf `blur`/`Enter`, kein DOM-Rebuild.

### Bug 4: Event-Listener-Leak in Analytics

**Symptom:** „Bezahlt markieren" Button wurde nach mehrfachem View-Wechsel mehrfach ausgelöst.  
**Ursache:** `document.addEventListener('click', markPaidHandler)` wurde bei jedem `renderAnalytics`-Aufruf neu registriert ohne vorheriges Entfernen.  
**Fix:** Handler-Referenz gespeichert, `destroyAnalytics` entfernt den Listener via `removeEventListener`.

### Bug 5: Filter-Index-Fehler in Assignments

**Symptom:** Auftraggeber- und Zahlungsstatus-Filter könnten bei DOM-Änderungen brechen.  
**Ursache:** `querySelectorAll('.filter-bar')[1]` und `[2]` – Index-basierter Zugriff.  
**Fix:** `data-filter="year|client|paid"` Attribut auf Filter-Bars, selektion via `[data-filter="..."]`.

---

## Bekannte Einschränkungen (nicht Bugs)

- **Icons:** Einfache einfarbige PNGs (programmatisch generiert). Keine echten App-Icons.
- **Kein Passwortschutz:** Daten liegen offen in localStorage.
- **Kein Multi-User:** Einzelnutzer-App.
- **Steuer:** Vereinfachte Berechnung ohne SV, Werbungskosten etc. – bewusst als Richtwert.
- **Offline-Sync:** Wenn auf zwei Geräten gleichzeitig gearbeitet wird, gewinnt Last-Write-Wins.
- **Kein Datums-Picker:** Native `<input type="date">` – ausreichend für iOS/Desktop.
- **CSV-Trennzeichen:** Semikolon (`;`) für österreichisches Excel-Kompatibilität.

---

## Offene Aufgaben / Nächste sinnvolle Schritte

### Priorität 1 – Deployment fertigstellen

- [ ] Branch `claude/youthful-ride-2hfPf` als Default-Branch in GitHub setzen  
      (GitHub → Settings → Branches → Default Branch)
- [ ] GitHub Pages aktivieren (Settings → Pages → Deploy from branch)
- [ ] App-URL testen: `https://buildwithyr.github.io/nebeneinkuenfte/`

### Priorität 2 – UX-Verbesserungen

- [ ] Echte App-Icons erstellen (PWA-Richtlinien: min. 512×512px mit Padding)
- [ ] „Swipe to delete" auf Listen-Elementen (iOS-Pattern)
- [ ] Pull-to-Refresh Geste für manuellen Sync
- [ ] Suchfeld in Auftrags-Liste
- [ ] Sortierung der Aufträge (nicht nur nach Datum)

### Priorität 3 – Steuer-Erweiterungen

- [ ] Steuer-Export als PDF (für Steuerberater)
- [ ] Jahresvergleich (mehrere Jahre in einem Chart)
- [ ] Einnahmen-Grenzwert-Warnung (z.B. bei Annäherung an Kleinunternehmergrenze)

### Priorität 4 – Technische Verbesserungen

- [ ] Minifizierung von `chart.umd.js` (aktuell 205KB unminifiziert; min. wäre ~70KB)
- [ ] SW Cache-Version automatisch aus Version in `package.json` ableiten
- [ ] `beforeinstallprompt` Event abfangen für eigenen Install-Banner

---

## Verzeichnisstruktur

```
nebeneinkuenfte/
├── .nojekyll                    # GitHub Pages: kein Jekyll
├── index.html                   # App-Shell, lädt alle Module
├── manifest.json                # PWA Manifest
├── sw.js                        # Service Worker (Cache-First, v1.0.1)
├── README.md                    # Setup-Doku
├── PROJECT_STATE.md             # Diese Datei
│
├── assets/
│   ├── icons/
│   │   ├── icon-192.png         # PWA Icon (einfarbig teal, programmatisch)
│   │   └── icon-512.png         # PWA Icon (einfarbig teal, programmatisch)
│   └── vendor/
│       └── chart.umd.js         # Chart.js 4.4.4 (lokal, kein CDN)
│
└── src/
    ├── app.js                   # App-Controller, Navigation, Toast, SW-Registrierung
    │
    ├── components/
    │   ├── dashboard.js         # Dashboard-View + Monatschart
    │   ├── assignments.js       # Aufträge-View + CRUD-Modal
    │   ├── clients.js           # Auftraggeber-View + CRUD-Modal
    │   ├── analytics.js         # Berichte-View (4 Tabs + Donut-Chart)
    │   └── settings.js          # Einstellungen-View (kein store.on-Listener!)
    │
    ├── services/
    │   ├── store.js             # Zentraler State (Pub/Sub, localStorage)
    │   ├── storage.js           # localStorage Wrapper
    │   ├── calculations.js      # AT-Steuer, km-Geld, Aggregationen, Formatierung
    │   ├── sync.js              # GitHub Gist Sync (push/pull/sync)
    │   └── export.js            # JSON Export/Import, CSV Export
    │
    └── styles/
        └── main.css             # Alle Styles (Design-Tokens, Dark/Light, Mobile-First)
```

---

## Wichtige Designentscheidungen

### CSS-Architektur

- Alle Design-Tokens als CSS Custom Properties in `:root` (Dark) und `[data-theme="light"]`
- Mobile-First (max-width: 640px für Content, Sidebar-Nav ab 640px)
- Keine CSS-Präprozessoren, kein PostCSS
- `env(safe-area-inset-*)` für iPhone Notch/Home-Bar

### Komponenten-Pattern

```js
export function renderX(container) {
  _render(container);              // HTML schreiben
  const unsub = store.on(...);    // Listener registrieren
  container._xUnsub = () => unsub(); // Cleanup speichern
}

export function destroyX(container) {
  container._xUnsub?.();          // Listener entfernen
  // Chart zerstören, document-Listener entfernen
}
```

### Warum kein `store.on('settings')` in Settings-Komponente

Jede Settings-Änderung würde `_render(container)` triggern → vollständiger DOM-Rebuild → Fokus-Verlust in Eingabefeldern. Settings spart auf `blur`/`Enter` und aktualisiert nur gezielt einzelne DOM-Elemente.

### Chart.js lokal statt CDN

Ursprünglich CDN → bei langsamem/blockiertem CDN fror die App ein (synchrones `<script>` blockiert JS-Ausführung). Jetzt: `assets/vendor/chart.umd.js` mit `defer` → keine Netzwerk-Abhängigkeit, offline-fähig.

### Modal-Backdrop pointer-events

```css
.modal-backdrop {
  pointer-events: none;
}
.modal-backdrop.visible {
  pointer-events: auto;
}
```

Ohne diesen Fix fängt das unsichtbare (aber `position:fixed; inset:0; z-index:60`) Backdrop alle Klicks ab.

---

## Bewusst verworfene Ansätze

| Ansatz                                           | Verworfen weil                                                |
| ------------------------------------------------ | ------------------------------------------------------------- |
| React/Vue/Svelte                                 | Build-Step, Node.js Abhängigkeit, Overkill für diesen Umfang  |
| IndexedDB                                        | Zu komplex, localStorage reicht für <50KB                     |
| Google Sheets Sync                               | OAuth-Flow komplex, Google-Account-Pflicht                    |
| Auto-Sync                                        | Unzuverlässig, unerwartet bei Firmenlaptop, bewusst abgelehnt |
| Jahr-basierte Dateistruktur (wie Excel)          | Keine globalen Auswertungen möglich, Filter reichen           |
| PWA mit Build-Tool (Vite etc.)                   | Widerspricht dem Ziel: kein Build, direkt auf GH Pages        |
| CSV als primäres Speicherformat                  | Kein verschachteltes Datenmodell möglich                      |
| Automatischer Grenzsteuersatz ohne Konfiguration | Nutzer muss Haupteinkommen anpassen können                    |

---

## Lessons Learned aus der Entwicklung

1. **`pointer-events` auf unsichtbaren Fixed-Overlays immer explizit setzen.** Ein `opacity:0` Element ohne `pointer-events:none` fängt weiterhin alle Events ab – ein subtiler Bug der aussieht wie ein kompletter Freeze.

2. **`caches.addAll()` ist atomar.** Externe URLs (CDN) nie in die Static-Asset-Liste aufnehmen. Ein 403 oder Timeout lässt den ganzen SW-Install fehlschlagen → Retry-Loop → CPU-Last.

3. **Zirkuläre Importe vermeiden.** `assignments.js` importiert `showToast` aus `app.js`, `app.js` importiert `assignments.js`. Funktioniert zufällig, ist aber schlechtes Design. Besser: `showToast` in eigene `toast.js` auslagern.

4. **`store.on()` in Settings-Komponente führt zu Re-render-Storm.** Jede Einstellungsänderung → DOM-Rebuild → Fokus weg. Settings ist der einzige View der keinen Store-Listener registriert.

5. **Playwright ist ein hervorragendes Debugging-Tool für „mysteröse" Browser-Freezes.** Timing-Daten zeigen sofort ob eine Operation 500ms oder 30.000ms dauert.

6. **Chart.js UMD vs. CDN:** Das `defer`-Attribut und lokale Bundling löst gleichzeitig Offline-Fähigkeit und CDN-Timeout-Problem.

---

## Übergabe an neuen Chat

Der folgende Prompt kann direkt in einen neuen Claude-Code-Chat kopiert werden:

---

```
Du übernimmst ein bestehendes Projekt. Lies zuerst PROJECT_STATE.md vollständig.

Repository: buildwithyr/nebeneinkuenfte
Branch: claude/youthful-ride-2hfPf
Working Directory: /home/user/nebeneinkuenfte

KONTEXT:
Progressive Web App (Vanilla JS, ES Modules, kein Framework) zur Verwaltung von
Mystery Shopping / Nebeneinkünften. Ersetzt eine Excel-Lösung. Österreichischer Nutzer,
~30 Aufträge/Jahr, iPhone + Firmenlaptop, GitHub Pages Hosting.

AKTUELLER STAND:
- App ist vollständig implementiert und lokal getestet (Playwright)
- 3 kritische Bugs wurden behoben (pointer-events Freeze, SW Install-Loop, Settings Re-render)
- Alle Kernfunktionen funktionieren: Dashboard, Aufträge, Auftraggeber, Berichte, Einstellungen
- Chart.js ist lokal eingebunden (assets/vendor/chart.umd.js), kein CDN
- GitHub Gist Sync ist implementiert (nur manuell, kein Auto-Sync)
- Service Worker v1.0.1 ist funktionsfähig

NOCH NICHT ERLEDIGT:
1. Branch als Default-Branch setzen (im GitHub UI: Settings → Branches)
2. GitHub Pages aktivieren (Settings → Pages → Deploy from branch)
3. Echte App-Icons erstellen (aktuell einfarbige Platzhalter-PNGs)

WICHTIGE TECHNISCHE DETAILS:
- localStorage Key: "nebeneinkuenfte_v1"
- Modal-Backdrop MUSS pointer-events:none haben wenn nicht .visible (kritischer Bug sonst)
- settings.js registriert KEINEN store.on('settings') Listener (würde Re-render-Storm verursachen)
- analytics.js registriert document-click-Listener der in destroyAnalytics() entfernt werden muss
- chart.umd.js liegt in assets/vendor/ und wird mit defer geladen (kein CDN)

ARCHITEKTUR:
- store.js: Singleton, Pub/Sub, localStorage-backed
- Jede View: renderX(container) + destroyX(container)
- Steuer: Österreich § 33 EStG, Grenzsteuersatz auf Nebeneinkommen, alle Werte = Schätzung
- Sync: GitHub Gist, Last-Write-Wins via meta.lastModified

Was möchtest du als nächstes umsetzen?
```

---

_Letzte Aktualisierung: 2026-05-29 | Commit: 811d2bf_
