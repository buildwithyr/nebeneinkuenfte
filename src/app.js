/**
 * App Controller – Navigation, Auth, Toast, Service Worker
 */

import { store } from './services/store.js';
import { supabase } from './services/supabase.js';
import { db } from './services/db.js';

/**
 * App-Version (Anzeige + Service-Worker-Cache).
 * WICHTIG: Bei Änderung auch CACHE_VERSION in sw.js gleich halten –
 * der Service Worker kann dieses Modul nicht importieren.
 */
export const APP_VERSION = '2.3.0';
import { renderDashboard,   destroyDashboard }   from './components/dashboard.js';
import { renderAssignments, destroyAssignments } from './components/assignments.js';
import { renderClients,     destroyClients }     from './components/clients.js';
import { renderAnalytics,   destroyAnalytics }   from './components/analytics.js';
import { renderSettings,    destroySettings }    from './components/settings.js';

// ---- Toast ----
export function showToast(message, type = 'info', duration = 3500) {
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
  }, duration);
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

function _showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  _attachLoginListeners();
}

function _hideLoginScreen() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = '';
}

function _attachLoginListeners() {
  const emailInput    = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const loginBtn      = document.getElementById('login-btn');
  const signupBtn     = document.getElementById('signup-btn');
  const errorEl       = document.getElementById('login-error');

  function _setLoading(loading) {
    loginBtn.disabled  = loading;
    signupBtn.disabled = loading;
    loginBtn.textContent  = loading ? '⏳ Bitte warten…' : 'Anmelden';
  }

  function _showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function _clearError() {
    errorEl.style.display = 'none';
  }

  loginBtn.addEventListener('click', async () => {
    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) { _showError('Bitte E-Mail und Passwort eingeben.'); return; }

    _clearError();
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

  signupBtn.addEventListener('click', async () => {
    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) { _showError('Bitte E-Mail und Passwort eingeben.'); return; }
    if (password.length < 6) { _showError('Passwort muss mindestens 6 Zeichen haben.'); return; }

    _clearError();
    _setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    _setLoading(false);

    if (error) {
      _showError(error.message);
    } else {
      _showError('');
      emailInput.value = '';
      passwordInput.value = '';
      showToast('Konto erstellt – bitte E-Mail bestätigen, dann anmelden.', 'success');
    }
  });

  // Enter-Taste → Login
  [emailInput, passwordInput].forEach(el => {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn.click(); });
  });
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

// ---- Update-Erkennung ----
// iOS suspendiert Home-Bildschirm-Apps statt sie neu zu laden – ein neuer
// Service Worker kommt daher oft erst zwei App-Starts nach dem Deploy zum
// Zug. Wir prüfen deshalb aktiv bei jeder Rückkehr in den Vordergrund auf
// Updates und weisen den Nutzer per Toast darauf hin, statt die Seite
// eigenmächtig neu zu laden (würde Formulareingaben/Sync-Status verwerfen).

let _updateNotified = false;

function _notifyUpdateAvailable() {
  if (_updateNotified) return;
  _updateNotified = true;
  showToast('Update verfügbar – App bitte schließen und neu öffnen', 'info', 10000);
}

function _watchForUpdates(registration) {
  // Fall 1: Beim Registrieren liegt bereits ein installierter, aber noch
  // nicht aktiver Worker vor (z.B. Install schlug vorher fehl und wartet).
  if (registration.waiting && registration.active) _notifyUpdateAvailable();

  // Fall 2: Ein neuer Worker wird während der laufenden Session gefunden
  // und installiert, während schon ein anderer die Seite kontrolliert.
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        _notifyUpdateAvailable();
      }
    });
  });

  // sw.js prüft Byte-Änderungen normalerweise nur bei einer echten
  // Navigation – die fehlt beim iOS-Resume aus dem Suspend-Zustand.
  // Also selbst aktiv nachfragen, sobald die App wieder sichtbar wird.
  const checkForUpdate = () => {
    if (document.visibilityState === 'visible') registration.update().catch(() => {});
  };
  document.addEventListener('visibilitychange', checkForUpdate);
  window.addEventListener('focus', checkForUpdate);
  window.addEventListener('pageshow', checkForUpdate);
}

async function _registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    _watchForUpdates(registration);
  } catch (err) {
    console.warn('[App] Service Worker Registrierung fehlgeschlagen:', err);
  }
}

// ---- Einstiegspunkt ----

document.addEventListener('DOMContentLoaded', async () => {
  // Auth-Status prüfen
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    await _initApp(session.user);
  } else {
    _showLoginScreen();
  }

  // Auf Auth-Änderungen reagieren (Login/Logout von außen)
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await _initApp(session.user);
    } else if (event === 'SIGNED_OUT') {
      appInitialized = false;
      store.disableSync();
      db.unsubscribeRealtime();
      _showLoginScreen();
    }
  });
});
