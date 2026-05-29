/**
 * App Controller – Navigation, Toast, Service Worker Registration
 */

import { store } from './services/store.js';
import { renderDashboard,   destroyDashboard }   from './components/dashboard.js';
import { renderAssignments, destroyAssignments } from './components/assignments.js';
import { renderClients,     destroyClients }     from './components/clients.js';
import { renderAnalytics,   destroyAnalytics }   from './components/analytics.js';
import { renderSettings,    destroySettings }    from './components/settings.js';

// ---- Exportiere showToast global (wird in Komponenten importiert) ----
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

function navigate(viewName) {
  if (!VIEWS[viewName]) viewName = 'dashboard';

  // Teardown vorheriger View
  if (currentView && VIEWS[currentView]) {
    VIEWS[currentView].destroy(content);
  }

  currentView = viewName;

  // Nav-Items aktualisieren
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewName);
  });

  // FAB je View anzeigen/verstecken
  const fab = document.getElementById('fab');
  if (fab) fab.style.display = viewName === 'assignments' ? 'flex' : 'none';

  // Inhalt rendern
  content.scrollTop = 0;
  VIEWS[viewName].render(content);

  // URL-Hash aktualisieren (für Reload)
  history.replaceState(null, '', `#${viewName}`);
}

// Globale navigate-Funktion (für onclick in Templates)
window.app = { navigate };

// ---- Initialisierung ----
function init() {
  store.init();

  // Nav-Klick-Handler
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  // FAB
  document.getElementById('fab')?.addEventListener('click', () => {
    if (currentView === 'assignments') {
      window._openNewAssignment?.();
    }
  });

  // Theme-Toggle im Header
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = store.settings.theme ?? 'dark';
    store.updateSettings({ theme: current === 'dark' ? 'light' : 'dark' });
    _updateThemeIcon();
  });

  _updateThemeIcon();

  // Startansicht aus URL-Hash oder Default
  const hash = location.hash.replace('#', '');
  const startView = VIEWS[hash] ? hash : 'dashboard';

  // Shortcut: ?view=assignments&action=new (aus Manifest-Shortcuts)
  const params = new URLSearchParams(location.search);
  const paramView = params.get('view');
  if (paramView && VIEWS[paramView]) {
    navigate(paramView);
    if (params.get('action') === 'new' && paramView === 'assignments') {
      setTimeout(() => window._openNewAssignment?.(), 100);
    }
  } else {
    navigate(startView);
  }

  // Service Worker registrieren
  _registerSW();
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

// Start
document.addEventListener('DOMContentLoaded', init);
