/**
 * Zentrale App-Konfiguration.
 *
 * Diese App ist eine statische PWA OHNE Build-Step – es gibt zur Laufzeit
 * also kein `import.meta.env` / `process.env`. Konfiguriert wird daher hier:
 *
 *  - SUPABASE_URL + SUPABASE_ANON_KEY sind ein **Publishable Key** und damit
 *    öffentlich; der Datenschutz läuft über RLS, nicht über Geheimhaltung.
 *  - Optionale Überschreibung über ein globales `window.__APP_CONFIG__`-Objekt,
 *    das z.B. in einer (nicht eingecheckten) Datei vor `app.js` gesetzt werden
 *    kann – nützlich für abweichende Umgebungen.
 *
 * WICHTIG: Niemals den `service_role`/`secret`-Key hier hinterlegen – der
 * umgeht RLS und gehört ausschließlich auf einen Server.
 *
 * Die App-URL wird zur LAUFZEIT aus `window.location` abgeleitet. Dadurch
 * funktionieren Auth-Redirects (Passwort-Reset) automatisch lokal UND in
 * Production, ganz ohne hartcodierte localhost-Adressen.
 */

const _override = (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};

export const SUPABASE_URL =
  _override.supabaseUrl ?? 'https://aaiubbokbcezeazeycer.supabase.co';

export const SUPABASE_ANON_KEY =
  _override.supabaseAnonKey ?? 'sb_publishable_mHVouqX-n7dfWdcyG6RALQ_JYw64UL7';

/**
 * Basis-URL der App inkl. evtl. Unterpfad (z.B. GitHub Pages: /nebeneinkuenfte/).
 * Endet immer mit '/'. Optional über window.__APP_CONFIG__.appUrl überschreibbar.
 */
export function appBaseUrl() {
  if (_override.appUrl) return _override.appUrl.replace(/\/?$/, '/');
  const { origin, pathname } = window.location;
  const dir = pathname.replace(/[^/]*$/, ''); // letzten Pfadteil (index.html) entfernen
  return origin + dir;
}

/**
 * Redirect-Ziel für Passwort-Reset.
 *
 * Es wird die App-Basis-URL verwendet: Supabase hängt den Recovery-Token als
 * URL-Fragment an, die App erkennt ihn beim Laden über das
 * `PASSWORD_RECOVERY`-Event und zeigt automatisch die "Neues Passwort"-Maske.
 * (Eine eigene /reset-password-Route ist bei dieser hash-basierten Static-SPA
 * nicht nötig und würde auf GitHub Pages ins 404 laufen.)
 */
export function authRedirectUrl() {
  return appBaseUrl();
}
