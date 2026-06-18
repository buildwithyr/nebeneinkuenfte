# Setup – Supabase

Die App ist ein statisches PWA-Frontend (Vanilla JS) und nutzt **Supabase** für
Login (Auth) und Datenspeicherung (Postgres mit Row Level Security).

## 1. Supabase-Projekt

- Projekt: **Nebeneinkuenfte** (`aaiubbokbcezeazeycer`, Region `eu-central-1`)
- Tabellen: `clients`, `assignments`, `user_settings`
- Schema-Definition: [`supabase/schema.sql`](supabase/schema.sql)

Bei einem **neuen** Projekt das Schema einmalig einspielen:

> Supabase Dashboard → SQL Editor → New Query → Inhalt von `supabase/schema.sql` einfügen → **Run**

Das legt Tabellen, RLS-Policies und Realtime an.

## 2. Verbindung im Code

Die Zugangsdaten stehen in [`src/services/supabase.js`](src/services/supabase.js):

```js
const SUPABASE_URL = 'https://aaiubbokbcezeazeycer.supabase.co';
const SUPABASE_KEY = 'sb_publishable_...'; // Publishable Key – für Client-Code vorgesehen
```

**Wichtig / Sicherheit:** Der hinterlegte Key ist ein **Publishable Key**
(`sb_publishable_…`), kein Geheimnis. Er darf öffentlich im Frontend stehen –
genau dafür ist er gedacht. Der Schutz der Daten passiert über **RLS** (siehe
unten), nicht über Geheimhaltung des Keys.

> **Niemals** den `service_role`-Key (oder `secret`-Key) ins Frontend/Repo legen –
> der umgeht RLS und hat vollen Zugriff.

## 3. Authentifizierung

- Methode: **E-Mail + Passwort** (`supabase.auth.signInWithPassword` / `signUp`)
- Registrierung erfordert i. d. R. eine E-Mail-Bestätigung
  (Supabase Dashboard → Authentication → Providers → Email)
- Session bleibt im Browser erhalten; die App reagiert auf
  `onAuthStateChange` (Login/Logout/Token-Refresh)

Empfohlene Auth-Härtung (Dashboard → Authentication → Policies/Settings):
- **Leaked Password Protection** aktivieren (HaveIBeenPwned-Abgleich)

## 4. Row Level Security (RLS)

RLS ist auf allen drei Tabellen **aktiv**. Jede Policy erlaubt nur Zugriff auf
die eigenen Zeilen:

```sql
using (auth.uid() = user_id) with check (auth.uid() = user_id)
```

Dadurch sieht/ändert jeder eingeloggte Nutzer ausschließlich seine eigenen
Daten – selbst mit dem öffentlichen Publishable Key.

## 5. Datentypen

| Spalte (assignments) | Typ       | Hinweis                                  |
|----------------------|-----------|------------------------------------------|
| `fee`                | `numeric` | Beträge als **Zahl** (nicht Text)        |
| `km`                 | `integer` | Kilometer als Ganzzahl                   |
| `date`, `paid_date`  | `text`    | ISO-Datum `YYYY-MM-DD`                    |
| `status`             | `text`    | `open` \| `completed` \| `paid`          |

> PostgREST liefert `numeric` in JSON als String aus; der Code wandelt beim
> Laden defensiv mit `Number()/parseFloat()` zurück in Zahlen
> (`src/services/db.js`, `src/services/calculations.js`).

## 6. Lokal starten

Reine statische Dateien – ein einfacher HTTP-Server genügt:

```bash
python3 -m http.server 8080   # oder: npx serve .
```

Dann `http://localhost:8080` öffnen, registrieren/anmelden, loslegen.

## 7. Tests

```bash
npm test   # node --test, ohne Build/Dependencies
```

Deckt die Steuer-/Freigrenzen-Logik ab (`test/calculations.test.js`).
