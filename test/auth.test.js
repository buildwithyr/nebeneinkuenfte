/**
 * Tests für die Auth-Hilfslogik:
 *  - cooldownSeconds(): Rate-Limit-Meldung → Wartesekunden
 *  - appBaseUrl()/authRedirectUrl(): dynamische App-URL, KEIN hartcodiertes localhost
 *
 * Ausführen mit:  node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cooldownSeconds } from '../src/services/authUtils.js';

// config.js liest window.__APP_CONFIG__ beim Import → window vorher bereitstellen.
globalThis.window = { location: { origin: 'http://localhost:8080', pathname: '/' } };
const { appBaseUrl, authRedirectUrl, SUPABASE_URL, SUPABASE_ANON_KEY } =
  await import('../src/config.js');

// ---- cooldownSeconds ----

test('cooldownSeconds: erkennt die Supabase-Rate-Limit-Meldung', () => {
  assert.equal(
    cooldownSeconds('For security purposes, you can only request this after 35 seconds.'),
    35,
  );
  assert.equal(cooldownSeconds('try again after 1 second'), 1);
});

test('cooldownSeconds: kein Limit → null (keine unnötige Fehlermeldung)', () => {
  assert.equal(cooldownSeconds('Invalid login credentials'), null);
  assert.equal(cooldownSeconds(''), null);
  assert.equal(cooldownSeconds(undefined), null);
});

// ---- appBaseUrl / authRedirectUrl ----

test('appBaseUrl: GitHub-Pages-Unterpfad bleibt erhalten', () => {
  globalThis.window.location = { origin: 'https://user.github.io', pathname: '/nebeneinkuenfte/' };
  assert.equal(appBaseUrl(), 'https://user.github.io/nebeneinkuenfte/');
});

test('appBaseUrl: index.html wird entfernt, endet mit /', () => {
  globalThis.window.location = { origin: 'http://localhost:8080', pathname: '/index.html' };
  assert.equal(appBaseUrl(), 'http://localhost:8080/');
});

test('authRedirectUrl: in Production KEIN localhost', () => {
  globalThis.window.location = { origin: 'https://user.github.io', pathname: '/nebeneinkuenfte/' };
  const url = authRedirectUrl();
  assert.equal(url, 'https://user.github.io/nebeneinkuenfte/');
  assert.ok(!url.includes('localhost'));
});

// ---- Sicherheit: kein Secret-Key im Frontend-Config ----

test('config: nur Publishable/anon Key, kein service_role', () => {
  assert.ok(SUPABASE_URL.startsWith('https://'));
  assert.ok(!/service_role|sb_secret/.test(SUPABASE_ANON_KEY));
});
