# Deployment: GitHub Pages vs. Vercel

Kurze Gegenüberstellung für **dieses** Projekt – eine rein statische PWA
(Vanilla JS, kein Build-Schritt, kein Server/Backend, Daten über Supabase).

## Vercel

**Vorteile**
- Sehr schnelles globales CDN, automatische HTTPS-Zertifikate
- Deploy-Previews pro Branch/PR (jeder Push bekommt eine Test-URL)
- Einfache Custom-Domains inkl. automatischem Cert-Handling
- Environment Variables im Dashboard (falls Keys später nicht im Code stehen sollen)
- Serverless/Edge Functions verfügbar, falls später ein Backend nötig wird
- Saubere `Cache-Control`-Steuerung (relevant für PWA / Service Worker)

**Nachteile**
- Zusätzliches Konto/Plattform neben GitHub (mehr Moving Parts)
- Funktionsumfang für dieses Projekt großteils ungenutzt (Overkill)
- Kommerzielle Plattform mit Fair-Use-/Bandbreiten-Limits im Free-Tier

## GitHub Pages

**Vorteile**
- Direkt im selben Repo, kein zweiter Anbieter nötig
- Kostenlos, ausreichend für statische Single-User-/Kleingruppen-PWA
- Bereits vorbereitet: `.nojekyll` vorhanden, App läuft aus dem Repo-Root
- Simpel: „Settings → Pages → Deploy from branch" – fertig

**Nachteile**
- Keine Deploy-Previews pro PR (nur ein veröffentlichter Stand)
- Weniger Kontrolle über HTTP-Header / Caching (Service-Worker-Updates
  können dadurch zäher durchschlagen)
- Kein Backend/Edge-Funktionen, falls später benötigt
- Deploy-Latenz nach Push manchmal etwas träger

## Empfehlung für dieses Projekt

**GitHub Pages reicht – und ist aktuell die beste Wahl.**

Begründung:
- Die App ist vollständig statisch; sämtliche Dynamik (Auth, CRUD, Realtime)
  läuft über Supabase. Ein Server-/Build-Feature von Vercel wird nicht gebraucht.
- Das Repo ist bereits für Pages konfiguriert (`.nojekyll`, Root-Deployment).
- Ein Anbieter weniger = weniger Wartung; Keys sind ohnehin Publishable Keys,
  also keine geheimen Env-Vars nötig.

**Wechsel zu Vercel lohnt erst, wenn** eines davon eintritt:
- Du willst **Deploy-Previews** pro PR.
- Du brauchst **Custom-Header/Caching-Kontrolle** (z. B. feineres
  Service-Worker-Cache-Verhalten) oder eine eigene Domain mit wenig Aufwand.
- Es kommt **serverseitige Logik** (Edge/Serverless Functions) dazu.

> Praktisch: Da nur statische Dateien ausgeliefert werden, ist ein späterer
> Umzug GitHub Pages → Vercel jederzeit ohne Code-Änderung möglich.
