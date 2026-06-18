/**
 * App Controller – Navigation, Auth, Toast, Service Worker
 */

import { store } from './services/store.js';
import { supabase } from './services/supabase.js';
import { db } from './services/db.js';
import { authRedirectUrl } from './config.js';
import { cooldownSeconds } from './services/authUtils.js';

/**
 * App-Version (Anzeige + Service-Worker-Cache).
 * WICHTIG: Bei Änderung auch CACHE_VERSION in sw.js gleich halten –
 * der Service Worker kann dieses Modul nicht importieren.
 */
export const APP_VERSION = '2.6.0';
import { renderDashboard,   destroyDashboard }   from './components/dashboard.js';
import { renderAssignments, destroyAssignments } from './components/assignments.js';
import { renderClients,     destroyClients }     from './components/clients.js';
import { renderAnalytics,   destroyAnalytics }   from './components/analytics.js';
import { renderSettings,    destroySettings }    from './components/settings.js';

// ---- Toast ----
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3500);
}

// ---- Routing ----
const VIEWS = {
  dashboard:   { render: renderDashboard,   destroy: destroyDashboard   },
  assignments: { render: renderAssignments, destroy: destroyAssignments },
  clients:     { render: renderClients,     destroy: destroyClients     },
  analytics:   { render: renderAnalytics,   destroy: destroyAnalytics   },
  settings:    { render: renderSettings,    destroy: destroySettings    },
};

let currentView = null;
const content = document.getElementById('app-content');

export function navigate(viewName) {
  if (!VIEWS[viewName]) viewName = 'dashboard';

  if (currentView && VIEWS[currentView]) {
    VIEWS[currentView].destroy(content);
  }

  currentView = viewName;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewName);
  });

  const fab = document.getElementById('fab');
  if (fab) fab.style.display = viewName === 'assignments' ? 'flex' : 'none';

  content.scrollTop = 0;
  VIEWS[viewName].render(content);
  history.replaceState(null, '', `#${viewName}`);
}

window.app = { navigate };

// ---- Login Screen ----

let _loginListenersAttached = false;
// Früh erfassen: supabase-js (detectSessionInUrl) räumt den Recovery-Hash
// asynchron aus der URL – beim späteren DOMContentLoaded wäre er evtl. schon weg.
let _recoveryMode = _isRecoveryUrl();

function _showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  _attachLoginListeners();
}

function _hideLoginScreen() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = '';
}

// ---- Auth-Meldungen (Fehler rot / Info grün) ----

function _showError(msg) {
  const error = document.getElementById('login-error');
  const info  = document.getElementById('login-info');
  info.style.display = 'none';
  error.textContent = msg ?? '';
  error.style.display = msg ? 'block' : 'none';
}

function _showInfo(msg) {
  const error = document.getElementById('login-error');
  const info  = document.getElementById('login-info');
  error.style.display = 'none';
  info.textContent = msg ?? '';
  info.style.display = msg ? 'block' : 'none';
}

function _clearAuthMsg() {
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-info').style.display = 'none';
}

/** Eines der Panels (login | forgot | reset) zeigen, die übrigen verstecken. */
function _showPanel(name) {
  ['login', 'forgot', 'reset'].forEach(p => {
    const el = document.getElementById('panel-' + p);
    if (el) el.style.display = (p === name) ? '' : 'none';
  });
  _clearAuthMsg();
}

// ---- Recovery (Passwort-Reset-Link) ----

function _isRecoveryUrl() {
  return /type=recovery/.test(window.location.hash || '')
      || /type=recovery/.test(window.location.search || '');
}

function _clearRecoveryUrl() {
  history.replaceState(null, '', authRedirectUrl());
}

/** Button für `seconds` Sekunden sperren und sichtbar runterzählen. */
function _cooldownButton(btn, seconds) {
  const original = btn.dataset.label ?? btn.textContent;
  btn.dataset.label = original;
  let remaining = seconds;
  btn.disabled = true;
  const tick = () => {
    if (remaining <= 0) {
      btn.disabled = false;
      btn.textContent = original;
      return;
    }
    btn.textContent = `Bitte warten… (${remaining}s)`;
    remaining -= 1;
    setTimeout(tick, 1000);
  };
  tick();
}

function _attachLoginListeners() {
  // Listener nur einmal binden (Login-Screen wird mehrfach gezeigt: Logout etc.)
  if (_loginListenersAttached) return;
  _loginListenersAttached = true;

  const emailInput    = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const loginBtn      = document.getElementById('login-btn');
  const signupBtn     = document.getElementById('signup-btn');

  function _setLoading(loading) {
    loginBtn.disabled  = loading;
    signupBtn.disabled = loading;
    loginBtn.textContent = loading ? '⏳ Bitte warten…' : 'Anmelden';
  }

  // --- Anmelden ---
  loginBtn.addEventListener('click', async () => {
    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) { _showError('Bitte E-Mail und Passwort eingeben.'); return; }

    _clearAuthMsg();
    _setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    _setLoading(false);

    if (error) {
      _showError(error.message === 'Invalid login credentials'
        ? 'Falsche E-Mail oder falsches Passwort.'
        : error.message);
    }
    // Erfolg: onAuthStateChange übernimmt das Weiterleiten
  });

  // --- Konto erstellen ---
  signupBtn.addEventListener('click', async () => {
    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) { _showError('Bitte E-Mail und Passwort eingeben.'); return; }
    if (password.length < 6) { _showError('Passwort muss mindestens 6 Zeichen haben.'); return; }

    _clearAuthMsg();
    _setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    _setLoading(false);

    if (error) { _showError(error.message); return; }
    emailInput.value = '';
    passwordInput.value = '';
    showToast('Konto erstellt – bitte E-Mail bestätigen, dann anmelden.', 'success');
  });

  // --- Panelwechsel: Passwort vergessen ---
  document.getElementById('forgot-btn').addEventListener('click', () => {
    document.getElementById('forgot-email').value = emailInput.value.trim();
    _showPanel('forgot');
  });
  document.getElementById('forgot-back-btn').addEventListener('click', () => _showPanel('login'));

  // --- Reset-Mail anfordern (mit Cooldown-Handling, kein Dauersenden) ---
  const forgotEmail   = document.getElementById('forgot-email');
  const forgotSendBtn = document.getElementById('forgot-send-btn');
  forgotSendBtn.addEventListener('click', async () => {
    if (forgotSendBtn.disabled) return;
    const email = forgotEmail.value.trim();
    if (!email) { _showError('Bitte E-Mail eingeben.'); return; }

    _clearAuthMsg();
    forgotSendBtn.disabled = true;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectUrl(),
    });

    if (error) {
      const wait = cooldownSeconds(error.message);
      if (wait != null) {
        _showError(`Bitte warte kurz, bevor du erneut einen Link anforderst (${wait}s).`);
        _cooldownButton(forgotSendBtn, wait);
      } else {
        forgotSendBtn.disabled = false;
        _showError(error.message);
      }
      return;
    }
    // Datenschutz: immer dieselbe neutrale Meldung, plus kurzer Cooldown gegen Doppelklicks
    _showInfo('Wenn die E-Mail registriert ist, wurde ein Link zum Zurücksetzen gesendet.');
    _cooldownButton(forgotSendBtn, 35);
  });

  // --- Neues Passwort speichern (nach Klick auf den Recovery-Link) ---
  const resetPw      = document.getElementById('reset-password');
  const resetPw2     = document.getElementById('reset-password2');
  const resetSaveBtn = document.getElementById('reset-save-btn');
  resetSaveBtn.addEventListener('click', async () => {
    const pw  = resetPw.value;
    const pw2 = resetPw2.value;
    if (pw.length < 6) { _showError('Passwort muss mindestens 6 Zeichen haben.'); return; }
    if (pw !== pw2)    { _showError('Die Passwörter stimmen nicht überein.'); return; }

    _clearAuthMsg();
    resetSaveBtn.disabled = true;
    const { data, error } = await supabase.auth.updateUser({ password: pw });
    resetSaveBtn.disabled = false;

    if (error) { _showError(error.message); return; }

    // Erfolgreich: Recovery beenden, URL säubern und direkt in die App
    _recoveryMode = false;
    resetPw.value = resetPw2.value = '';
    _clearRecoveryUrl();
    showToast('Passwort geändert ✓', 'success');
    await _initApp(data.user);
  });

  // Enter-Taste → jeweils passende Aktion
  [emailInput, passwordInput].forEach(el =>
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn.click(); }));
  forgotEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') forgotSendBtn.click(); });
  [resetPw, resetPw2].forEach(el =>
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') resetSaveBtn.click(); }));
}

// ---- App Initialisierung (nach Login) ----

let appInitialized = false;

async function _initApp(user) {
  _hideLoginScreen();
  db.setUserId(user.id);

  // SIGNED_IN kann mehrfach feuern (Token-Refresh, Tab-Fokus).
  // Beim zweiten Mal NICHT alles neu aufsetzen – nur frisch synchronisieren.
  if (appInitialized) {
    await _resume();
    return;
  }
  appInitialized = true;

  store.init();

  try {
    // Erst offline angefallene Änderungen nachholen, dann Remote laden –
    // sonst würden lokale Pending-Edits vom Remote-Stand überschrieben.
    await db.flushPending();
    const remote = await db.loadAll();

    if (remote.clients.length > 0 || remote.assignments.length > 0) {
      store.importFromSupabase(remote);
    } else {
      // Erster Login: lokale Daten in Supabase hochladen
      const local = store.getRawData();
      await db.pushAll(local.clients, local.assignments, local.settings);
    }
  } catch (err) {
    console.warn('[App] Supabase-Daten konnten nicht geladen werden, nutze lokale Daten:', err.message);
    showToast('Offline-Modus – Daten werden lokal gespeichert', 'info');
  }

  // Sync-Hooks einrichten: jede lokale Änderung → Supabase
  store.enableSync({
    onClientChange:     (c, del) => del ? db.deleteClient(c.id)     : db.upsertClient(c),
    onAssignmentChange: (a, del) => del ? db.deleteAssignment(a.id) : db.upsertAssignment(a),
    onSettingsChange:   (s)      => db.saveSettings(s),
  });

  // Realtime: Änderungen von anderen Geräten empfangen
  db.subscribeRealtime({
    onClient:     (payload) => store.applyRealtimeClient(payload),
    onAssignment: (payload) => store.applyRealtimeAssignment(payload),
  });

  _setupNavigation();
  _setupTheme(user);
  _setupPullToRefresh();
  _setupResumeSync();
  _navigateToStart();
  _registerSW();
}

// ---- Sync von Supabase (für Pull-to-Refresh und Resume-Sync) ----

export async function syncFromSupabase() {
  try {
    // Lokale Pending-Edits zuerst hochladen, damit sie nicht überschrieben werden.
    await db.flushPending();
    const remote = await db.loadAll();
    // Remote ist nach der Initialisierung die maßgebliche Quelle –
    // immer übernehmen, damit auch Löschungen von anderen Geräten ankommen.
    store.importFromSupabase(remote);
    return true;
  } catch (err) {
    console.warn('[App] Sync fehlgeschlagen:', err.message);
    return false;
  }
}

// ---- Resume-Sync: bei App-Rückkehr Realtime neu verbinden + voller Abgleich ----
// Realtime-WebSockets sterben auf Mobilgeräten beim Backgrounden. iOS feuert
// visibilitychange nicht zuverlässig – darum mehrere Events + Reconnect.

let _resumeTimer = null;

async function _resume() {
  db.reconnectRealtime();
  await syncFromSupabase();
}

function _setupResumeSync() {
  const onResume = () => {
    if (document.visibilityState !== 'visible') return;
    clearTimeout(_resumeTimer);
    _resumeTimer = setTimeout(_resume, 150);
  };

  document.addEventListener('visibilitychange', onResume);
  window.addEventListener('focus', onResume);
  window.addEventListener('pageshow', onResume);
  window.addEventListener('online', () => { _resume(); });
}

// ---- Pull-to-Refresh ----

function _setupPullToRefresh() {
  const appContent = document.getElementById('app-content');
  const indicator  = document.getElementById('pull-indicator');
  if (!appContent || !indicator) return;

  const THRESHOLD = 72;
  let startY = 0;
  let pulling = false;
  let triggered = false;

  appContent.addEventListener('touchstart', (e) => {
    if (appContent.scrollTop > 0) return;
    startY   = e.touches[0].clientY;
    pulling  = true;
    triggered = false;
  }, { passive: true });

  appContent.addEventListener('touchmove', (e) => {
    if (!pulling || appContent.scrollTop > 0) return;
    const delta = e.touches[0].clientY - startY;
    if (delta <= 0) return;

    const progress = Math.min(delta / THRESHOLD, 1);
    const translateY = Math.min(delta * 0.45, THRESHOLD * 0.55);
    indicator.style.transform = `translateY(${translateY}px)`;
    indicator.style.opacity   = String(progress);
    indicator.classList.toggle('ready', progress >= 1);
  }, { passive: true });

  appContent.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;

    const isReady = indicator.classList.contains('ready');
    indicator.classList.remove('ready');

    if (!isReady || triggered) {
      indicator.style.transform = '';
      indicator.style.opacity   = '0';
      return;
    }

    triggered = true;
    indicator.classList.add('loading');
    indicator.style.transform = `translateY(${THRESHOLD * 0.55}px)`;

    const ok = await syncFromSupabase();
    if (ok) showToast('Synchronisiert', 'success');

    indicator.classList.remove('loading');
    indicator.style.transform = '';
    indicator.style.opacity   = '0';
  });
}

function _setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  document.getElementById('fab')?.addEventListener('click', () => {
    if (currentView === 'assignments') {
      window._openNewAssignment?.();
    }
  });
}

function _setupTheme(user) {
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = store.settings.theme ?? 'dark';
    store.updateSettings({ theme: current === 'dark' ? 'light' : 'dark' });
    _updateThemeIcon();
  });

  // Logout-Button im Header
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.title = user.email;
    logoutBtn.style.display = 'flex';
    logoutBtn.addEventListener('click', async () => {
      if (!confirm('Abmelden?')) return;
      store.disableSync();
      db.unsubscribeRealtime();
      await supabase.auth.signOut();
    });
  }

  _updateThemeIcon();
}

function _navigateToStart() {
  const params = new URLSearchParams(location.search);
  const paramView = params.get('view');
  if (paramView && VIEWS[paramView]) {
    navigate(paramView);
    if (params.get('action') === 'new' && paramView === 'assignments') {
      setTimeout(() => window._openNewAssignment?.(), 100);
    }
  } else {
    const hash = location.hash.replace('#', '');
    navigate(VIEWS[hash] ? hash : 'dashboard');
  }
}

function _updateThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.textContent = store.settings.theme === 'dark' ? '☀️' : '🌙';
  btn.title = store.settings.theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

async function _registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (err) {
    console.warn('[App] Service Worker Registrierung fehlgeschlagen:', err);
  }
}

// ---- Einstiegspunkt ----

document.addEventListener('DOMContentLoaded', async () => {
  // _recoveryMode wurde bereits beim Modul-Load erfasst (siehe oben).
  // Bei Recovery NICHT in die App, sondern "Neues Passwort"-Maske zeigen.

  // Auth-Status prüfen (detectSessionInUrl hat bei Recovery bereits eine Session gesetzt)
  const { data: { session } } = await supabase.auth.getSession();

  if (_recoveryMode) {
    _showLoginScreen();
    _showPanel('reset');
  } else if (session) {
    await _initApp(session.user);
  } else {
    _showLoginScreen();
    _showPanel('login');
  }

  // Auf Auth-Änderungen reagieren (Login/Logout/Recovery von außen)
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      _recoveryMode = true;
      _showLoginScreen();
      _showPanel('reset');
      return;
    }
    if (event === 'SIGNED_IN' && session) {
      if (_recoveryMode) return; // während Recovery nicht in die App springen
      await _initApp(session.user);
    } else if (event === 'SIGNED_OUT') {
      appInitialized = false;
      store.disableSync();
      db.unsubscribeRealtime();
      _showLoginScreen();
      _showPanel('login');
    }
  });
});
