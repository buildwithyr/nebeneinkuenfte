# Nebeneinkünfte Tracker

Eine moderne Progressive Web App (PWA) für Mystery Shopping und Nebeneinkünfte.

## Features

- **Dashboard** – Jahresübersicht, Monatschart, Steuer-Schätzung, Rücklage-Empfehlung
- **Aufträge** – Aufträge anlegen, bearbeiten, filtern (Jahr, Auftraggeber, Zahlungsstatus)
- **Auftraggeber** – Verwaltung aller Auftraggeber (Whitebox, Langl & Partner, etc.)
- **Berichte** – Jahres-, Monats-, Auftraggeber-Auswertung + Offene Zahlungen
- **Einstellungen** – Steuerparameter, Kilometergeld, GitHub-Sync, Export/Import
- **PWA** – Installierbar auf iPhone und Desktop, offline nutzbar
- **Dark / Light Mode**

## Steuer-Schätzung (Österreich)

- Österreichische Einkommensteuer-Tarifstufen 2026 (§ 33 EStG), jahresbasiert konfigurierbar
- Grenzsteuersatz-Berechnung auf Basis des Hauptberuf-Bruttoeinkommens
- Kilometergeld (€ 0,42/km) als Betriebsausgabe
- **Alle Werte sind unverbindliche Schätzungen – keine Steuerberatung**

## GitHub Pages Deployment

```bash
# Branch pushen
git push origin main

# In GitHub: Settings → Pages → Deploy from branch: main
```

Die App ist so konfiguriert, dass sie direkt aus dem Repository-Root deployed werden kann.

## Import alter Aufträge (CSV)

Alte Aufträge (z. B. aus 2024/2025) lassen sich per CSV importieren:

1. **Einstellungen → Export & Import → „CSV-Import (Aufträge)"** öffnen.
2. CSV-Datei (UTF-8) wählen. Excel/Numbers: „Speichern unter → **CSV UTF-8**".
   Eine Vorlage liegt im Projekt: [`import-template.csv`](import-template.csv).
3. Die App **erkennt die Spalten automatisch** (Datum, Auftraggeber, Beschreibung,
   Betrag, Kilometer, Status, Notiz). Nicht eindeutige Spalten lassen sich im
   Assistenten **manuell zuordnen**.
4. **Vorschau** prüfen: gültige / fehlerhafte / doppelte Zeilen werden gezählt
   und markiert. Duplikate (gegen Bestand und innerhalb der Datei) werden
   standardmäßig übersprungen.
5. **„Import bestätigen"** → die Aufträge werden in Supabase gespeichert; das
   Dashboard (inkl. 730-€-Freibetrag) wird neu berechnet.

Erkannt werden:

- **Beträge** mit deutschem Komma (`142,50`) und Punkt (`142.50`), inkl.
  Tausendertrennzeichen und `€`.
- **Datumsformate** `12.03.2025`, `2025-03-12`, `12/03/2025` (Tag zuerst).
  Das **Jahr** wird automatisch aus dem Datum abgeleitet.
- **Status** wie `offen`/`abgeschlossen`/`bezahlt` (auch englisch).

> Der Import **fügt nur hinzu** und überschreibt keine bestehenden Daten.
> `.xlsx` wird nicht direkt gelesen – bitte vorher als CSV (UTF-8) exportieren.

## Synchronisation (optional)

Die App speichert Daten lokal (localStorage). Optional kann ein GitHub Gist zur Synchronisation zwischen Geräten genutzt werden:

1. GitHub Personal Access Token erstellen (Scope: `gist`)
2. In Einstellungen → Synchronisation eintragen
3. „Neuen Gist anlegen" klicken
4. Ab sofort mit „Jetzt Synchronisieren" zwischen Geräten sync'en

## Lokale Entwicklung

Da die App nur statische Dateien verwendet, reicht ein einfacher HTTP-Server:

```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve .
```

Dann im Browser: `http://localhost:8080`

## Datenmodell

```json
{
  "version": "1.0",
  "meta": { "lastModified": "ISO-String", "deviceId": "…" },
  "settings": { "kmRate": 0.42, "reserveRate": 0.40, … },
  "clients": [{ "id": "…", "name": "Whitebox", "active": true }],
  "assignments": [{
    "id": "…",
    "date": "2025-03-15",
    "clientId": "client-1",
    "description": "IQOS Flagship Store Wien",
    "fee": 35.00,
    "km": 42,
    "kmBillable": true,
    "paid": true,
    "paidDate": "2025-04-01",
    "type": "mystery_shopping",
    "note": ""
  }]
}
```

---
*Keine Steuerberatung. Alle Berechnungen sind Richtwerte.*
