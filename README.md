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

## Import alter Aufträge (CSV / Excel)

**Einstellungen → Export & Import → „CSV-Import (Aufträge)"** öffnen und eine
Datei wählen – **`.csv`, `.xlsx` oder `.xls`** (Excel wird via SheetJS gelesen,
die Bibliothek wird nur bei Bedarf nachgeladen). Vorlage:
[`import-template.csv`](import-template.csv).

Der Assistent erkennt **zwei Layouts automatisch**:

**1. Normales Layout** – Spalten wie Datum, Auftraggeber, Beschreibung, Betrag,
Kilometer, Status, Notiz. Nicht eindeutige Spalten lassen sich manuell zuordnen.
Datum wird aus `12.03.2025` / `2025-03-12` / `12/03/2025` erkannt, das Jahr
automatisch abgeleitet.

**2. Matrix-Layout** (nicht normierte Tabellen, **ohne Datum**) – erste Spalte =
Beschreibung, weitere Spalten = Auftraggeber, der Betrag steht in genau einer
Auftraggeber-Spalte, optional km ganz rechts:

| Beschreibung | Whitebox | Concertare | Market Mind |
|---|---|---|---|
| IQOS Anrufe | 40 | | |
| XXXLutz | | 10 | |

→ wird zu: *Whitebox / IQOS Anrufe / 40 €* und *Concertare / XXXLutz / 10 €*.
Da kein Datum vorhanden ist, wählst du im Assistenten nur das **Jahr**
(2024 / 2025 / 2026 …); Standardstatus ist **Bezahlt**. Die Vorschau ist
**voll editierbar** (Auftraggeber, Beschreibung, Betrag, km, Jahr, Status).

In beiden Fällen:

- **Beträge** mit deutschem Komma (`142,50`) und Punkt, inkl. `€`.
- **Vorschau** mit Zählung gültig / fehlerhaft / doppelt; **Duplikate** (Vergleich
  über Auftraggeber + Beschreibung + Betrag) werden standardmäßig übersprungen.
- Erst nach **„Import bestätigen"** wird in Supabase gespeichert; danach wird das
  Dashboard (inkl. 730-€-Freibetrag) neu berechnet.

> Der Import **fügt nur hinzu** und überschreibt keine bestehenden Daten.

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
