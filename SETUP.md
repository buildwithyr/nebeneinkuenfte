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

Die Zugangsdaten stehen zentral in [`src/config.js`](src/config.js):

```js
export const SUPABASE_URL      = 'https://aaiubbokbcezeazeycer.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_...'; // Publishable Key – für Client-Code vorgesehen
```

`src/services/supabase.js` erstellt daraus den Client. Optional lassen sich die
Werte über ein globales `window.__APP_CONFIG__` überschreiben (siehe
`.env.example`).

**Wichtig / Sicherheit:** Der hinterlegte Key ist ein **Publishable Key**
(`sb_publishable_…`), kein Geheimnis. Er darf öffentlich im Frontend stehen –
genau dafür ist er gedacht. Der Schutz der Daten passiert über **RLS** (siehe
unten), nicht über Geheimhaltung des Keys.

> **Niemals** den `service_role`-Key (oder `secret`-Key) ins Frontend/Repo legen –
> der umgeht RLS und hat vollen Zugriff.

## 3. Authentifizierung

- Methode: **E-Mail + Passwort** (`supabase.auth.signInWithPassword` / `signUp`)
- **Passwort vergessen / zurücksetzen** ist integriert (siehe unten).
- **Magic Link wird bewusst NICHT verwendet** – die App sendet keine OTP-/Magic-
  Link-Mails automatisch. Die einzige E-Mail-Aktion ist der Passwort-Reset, und
  der hat ein Cooldown-Handling (kein Mehrfach-/Dauersenden).
- Registrierung erfordert i. d. R. eine E-Mail-Bestätigung
  (Dashboard → Authentication → Providers → Email)
- Session bleibt im Browser erhalten; die App reagiert auf
  `onAuthStateChange` (Login/Logout/Token-Refresh/`PASSWORD_RECOVERY`)

Empfohlene Auth-Härtung (Dashboard → Authentication → Policies/Settings):
- **Leaked Password Protection** aktivieren (HaveIBeenPwned-Abgleich)

### 3a. URL Configuration (WICHTIG – behebt den "localhost"-Reset-Link)

> Dashboard → **Authentication → URL Configuration**

Wenn der Reset-Link in der E-Mail auf `localhost` zeigt, ist die **Site URL** im
Dashboard falsch gesetzt. So konfigurieren:

- **Site URL**: die echte Production-URL, z. B.
  `https://<user>.github.io/nebeneinkuenfte/` (oder die Vercel-/eigene Domain).
  **Niemals** `localhost` als Site URL in Production.
- **Redirect URLs** (alle erlaubten Ziele hinzufügen):
  - `http://localhost:8080/` – nur für lokale Entwicklung
  - `https://<user>.github.io/nebeneinkuenfte/` – Production
  - ggf. Vercel-Preview-URLs (z. B. `https://*.vercel.app/`)

Die App übergibt den Redirect **dynamisch** (`authRedirectUrl()` in
`src/config.js`) auf Basis von `window.location` – dadurch funktioniert der Link
lokal **und** in Production ohne hartcodierte Adressen. Wichtig ist nur, dass die
jeweilige URL oben in den **Redirect URLs** freigegeben ist.

### 3b. Passwort-Reset-Flow (in der App)

1. Login-Screen → **„Passwort vergessen?"** → E-Mail eingeben →
   `resetPasswordForEmail(email, { redirectTo })`.
2. Neutrale Bestätigung: „Wenn die E-Mail registriert ist, wurde ein Link
   gesendet." (verrät nicht, ob die Adresse existiert).
3. Nutzer klickt den Link in der E-Mail → landet auf der App-URL; Supabase hängt
   den Recovery-Token ans URL-Fragment.
4. Die App erkennt das über das `PASSWORD_RECOVERY`-Event und zeigt automatisch
   die **„Neues Passwort"**-Maske → `updateUser({ password })` → danach direkt
   eingeloggt im Dashboard.

> Hinweis: Es gibt bewusst **keine** eigene `/reset-password`-Route. Die App ist
> eine hash-basierte Static-SPA; ein echter Pfad würde auf GitHub Pages ins 404
> laufen. Die Recovery-Maske wird stattdessen über das Auth-Event ausgelöst.

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
