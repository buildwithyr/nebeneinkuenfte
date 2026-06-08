/**
 * Einstellungen
 *
 * WICHTIG: Diese Komponente hört NICHT auf store.on('settings').
 * Jede settings-Änderung würde sonst die gesamte Seite neu rendern (Re-render-Storm).
 * Stattdessen: Eingaben werden direkt im Store gespeichert, ohne DOM-Rebuild.
 *
 * Sync-Philosophie: Nur auf expliziten Benutzer-Befehl. Kein Auto-Sync,
 * kein setInterval, kein Background-Fetch.
 */

import { store } from '../services/store.js';
import { supabase } from '../services/supabase.js';
import { exportService } from '../services/export.js';
import { showToast, navigate, APP_VERSION } from '../app.js';
import { marginalTaxRate, formatPercent } from '../services/calculations.js';

export function renderSettings(container) {
  _render(container);
  // Kein store.on('settings') hier – würde bei jedem Tastendruck
  // die gesamte Seite neu rendern und Fokus aus Eingabefeldern stehlen.
}

export function destroySettings(container) {
  // Kein Listener registriert → nichts zu bereinigen
}

function _render(container) {
  const { settings } = store;
  const marginal = marginalTaxRate(settings.primaryIncomeGross ?? 46000);
  const userEmail = _getCachedEmail();

  container.innerHTML = `
    <div class="page-title">Einstellungen</div>
    <div class="page-subtitle">App & Steuer-Parameter</div>

    <!-- Steuer & Berechnung -->
    <div class="settings-section">
      <div class="settings-section-title">Steuer & Berechnung</div>
      <div class="settings-card">

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Hauptberufseinkommen (Brutto/Jahr)</div>
            <div class="sub">Für Grenzsteuersatz · Schätzung · Enter zum Speichern</div>
          </div>
          <input class="settings-input" type="number" id="s-primary-income"
            value="${settings.primaryIncomeGross ?? 46000}" min="0" step="500">
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Berechneter Grenzsteuersatz</div>
            <div class="sub">Österreich 2024/2025 · § 33 EStG · Schätzung</div>
          </div>
          <span class="settings-row-value" id="s-marginal-display">${formatPercent(marginal)}</span>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Automatischer Grenzsteuersatz</div>
            <div class="sub">Österreichische Tarifstufen verwenden</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="s-auto-tax" ${settings.useAutomaticTaxRate ? 'checked' : ''}>
            <span class="switch-track"></span>
          </label>
        </div>

        <div class="settings-row" id="s-manual-tax-row" style="${settings.useAutomaticTaxRate ? 'display:none' : ''}">
          <div class="settings-row-label">
            <div class="label">Manueller Steuersatz</div>
            <div class="sub">Überschreibt automatische Berechnung</div>
          </div>
          <div style="display:flex;align-items:center;gap:4px">
            <input class="settings-input" type="number" id="s-manual-rate"
              value="${((settings.manualTaxRate ?? 0.40) * 100).toFixed(0)}" min="0" max="100" step="1">
            <span style="color:var(--text-muted);font-size:0.875rem">%</span>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Rücklagen-Prozentsatz</div>
            <div class="sub">Empfohlene Steuerrücklage vom Honorar</div>
          </div>
          <div style="display:flex;align-items:center;gap:4px">
            <input class="settings-input" type="number" id="s-reserve-rate"
              value="${((settings.reserveRate ?? 0.40) * 100).toFixed(0)}" min="0" max="100" step="1">
            <span style="color:var(--text-muted);font-size:0.875rem">%</span>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Kilometergeld (€/km)</div>
            <div class="sub">Österreich 2024/2025: € 0,42</div>
          </div>
          <input class="settings-input" type="number" id="s-km-rate"
            value="${(settings.kmRate ?? 0.42).toFixed(2)}" min="0" step="0.01">
        </div>

      </div>
      <div class="info-box mt-3">
        <span>⚠️</span>
        <span>Alle Steuerberechnungen sind unverbindliche Schätzungen / Richtwerte. Keine steuerliche Beratung. Werte werden nach Verlassen des Feldes gespeichert.</span>
      </div>
    </div>

    <!-- Darstellung -->
    <div class="settings-section">
      <div class="settings-section-title">Darstellung</div>
      <div class="settings-card">

        <div class="settings-row">
          <div class="settings-row-label"><div class="label">Design</div></div>
          <div class="toggle-group">
            <button class="toggle-btn ${settings.theme === 'dark' ? 'active' : ''}" data-theme="dark">🌙 Dark</button>
            <button class="toggle-btn ${settings.theme === 'light' ? 'active' : ''}" data-theme="light">☀️ Light</button>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-label"><div class="label">Währungssymbol</div></div>
          <input class="settings-input" type="text" id="s-currency-symbol"
            value="${settings.currencySymbol ?? '€'}" maxlength="3" style="width:70px;text-align:center">
        </div>

      </div>
    </div>

    <!-- Konto & Sync -->
    <div class="settings-section">
      <div class="settings-section-title">Konto & Synchronisation</div>
      <div class="settings-card">

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Angemeldet als</div>
            <div class="sub" id="s-user-email">${userEmail ?? '–'}</div>
          </div>
          <span class="badge badge-success">Verbunden</span>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Sync-Status</div>
            <div class="sub">Änderungen werden automatisch gespeichert</div>
          </div>
          <span class="badge badge-success">Aktiv</span>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Abmelden</div>
            <div class="sub">Du wirst zur Login-Seite weitergeleitet</div>
          </div>
          <button class="btn btn-danger btn-sm" id="s-logout">Abmelden</button>
        </div>

      </div>
      <div class="info-box mt-3">
        <span>☁️</span>
        <span>Daten werden automatisch mit Supabase synchronisiert. Alle Geräte bleiben in Echtzeit auf dem neuesten Stand.</span>
      </div>
    </div>

    <!-- Export / Import -->
    <div class="settings-section">
      <div class="settings-section-title">Export & Import</div>
      <div class="settings-card">

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">JSON-Export (Vollbackup)</div>
            <div class="sub">Alle Daten · für Backup oder Geräte-Übertragung</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="s-export-json">⬇ JSON</button>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">CSV-Export – aktuelles Jahr</div>
            <div class="sub">Für Steuer / Buchhaltung</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="s-export-csv">⬇ CSV</button>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">CSV-Export – alle Jahre</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="s-export-csv-all">⬇ CSV Alle</button>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">JSON-Import</div>
            <div class="sub">Backup wiederherstellen – überschreibt alle Daten</div>
          </div>
          <button class="btn btn-danger btn-sm" id="s-import-json">⬆ Import</button>
          <input type="file" id="s-import-file" accept=".json" class="hidden">
        </div>

      </div>
    </div>

    <!-- Speicher / App -->
    <div class="settings-section">
      <div class="settings-section-title">Speicher & App</div>
      <div class="settings-card">

        <div class="settings-row">
          <div class="settings-row-label"><div class="label">Lokale Datenmenge</div></div>
          <span class="settings-row-value">${_storageSize()} KB</span>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">App-Cache leeren</div>
            <div class="sub">Service Worker Cache – App neu laden erforderlich</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="s-clear-cache">🗑 Cache</button>
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Alle Daten löschen</div>
            <div class="sub">Nicht rückgängig machbar</div>
          </div>
          <button class="btn btn-danger btn-sm" id="s-clear-data">🗑 Alle</button>
        </div>

      </div>
    </div>

    <!-- Info -->
    <div class="settings-section">
      <div class="settings-section-title">Info</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-row-label"><div class="label">Version</div></div>
          <span class="settings-row-value">${APP_VERSION}</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Steuer-Datenquelle</div>
            <div class="sub">§ 33 EStG, Österreich 2024/2025 · Schätzung, keine Beratung</div>
          </div>
        </div>
      </div>
    </div>
  `;

  _attachListeners(container);

  // Email asynchron nachladen falls noch nicht im Cache
  if (!userEmail) {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const el = container.querySelector('#s-user-email');
      if (el && user?.email) el.textContent = user.email;
    });
  }
}

function _attachListeners(container) {
  // ---------------------------------------------------------------
  // Eingabefelder: Speichern beim Verlassen (blur) oder Enter.
  // NICHT bei jedem Tastendruck (input) – das würde den Fokus stehlen
  // und auf langsamem Hardware zu sichtbarem Lag führen.
  // ---------------------------------------------------------------

  function saveNumerics() {
    const primaryIncome = parseFloat(container.querySelector('#s-primary-income')?.value);
    const manualRate    = parseFloat(container.querySelector('#s-manual-rate')?.value) / 100;
    const reserveRate   = parseFloat(container.querySelector('#s-reserve-rate')?.value) / 100;
    const kmRate        = parseFloat(container.querySelector('#s-km-rate')?.value);
    const currSym       = container.querySelector('#s-currency-symbol')?.value?.trim() || '€';

    const patch = {};
    if (!isNaN(primaryIncome) && primaryIncome >= 0) patch.primaryIncomeGross = primaryIncome;
    if (!isNaN(manualRate))   patch.manualTaxRate  = Math.max(0, Math.min(1, manualRate));
    if (!isNaN(reserveRate))  patch.reserveRate    = Math.max(0, Math.min(1, reserveRate));
    if (!isNaN(kmRate) && kmRate >= 0) patch.kmRate = kmRate;
    patch.currencySymbol = currSym;

    // Direkt in Store schreiben – löst kein DOM-Rebuild aus
    // (kein store.on('settings') registriert)
    store.updateSettings(patch);

    // Nur den Grenzsteuersatz-Wert im DOM aktualisieren (kein vollständiger Rebuild)
    const marginalEl = container.querySelector('#s-marginal-display');
    if (marginalEl) {
      marginalEl.textContent = formatPercent(marginalTaxRate(store.settings.primaryIncomeGross ?? 46000));
    }
  }

  // Speichern auf blur (Fokus verlassen) oder Enter
  const numericIds = ['#s-primary-income','#s-manual-rate','#s-reserve-rate','#s-km-rate','#s-currency-symbol'];
  numericIds.forEach(sel => {
    const el = container.querySelector(sel);
    if (!el) return;
    el.addEventListener('blur',  saveNumerics);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveNumerics(); el.blur(); } });
  });

  // Auto-Tax Toggle
  container.querySelector('#s-auto-tax')?.addEventListener('change', (e) => {
    store.updateSettings({ useAutomaticTaxRate: e.target.checked });
    const row = container.querySelector('#s-manual-tax-row');
    if (row) row.style.display = e.target.checked ? 'none' : '';
  });

  // Theme Toggle
  container.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.updateSettings({ theme: btn.dataset.theme });
      // Nur Buttons aktualisieren, nicht die ganze Seite
      container.querySelectorAll('[data-theme]').forEach(b =>
        b.classList.toggle('active', b.dataset.theme === btn.dataset.theme)
      );
    });
  });

  // ---------------------------------------------------------------
  // Konto: Abmelden
  // ---------------------------------------------------------------

  container.querySelector('#s-logout')?.addEventListener('click', async () => {
    if (!confirm('Wirklich abmelden?')) return;
    await supabase.auth.signOut();
  });

  // ---------------------------------------------------------------
  // Export / Import
  // ---------------------------------------------------------------

  container.querySelector('#s-export-json')?.addEventListener('click', () => {
    exportService.exportJSON();
    showToast('JSON-Backup heruntergeladen', 'success');
  });

  container.querySelector('#s-export-csv')?.addEventListener('click', () => {
    exportService.exportCSV(new Date().getFullYear());
    showToast('CSV heruntergeladen', 'success');
  });

  container.querySelector('#s-export-csv-all')?.addEventListener('click', () => {
    exportService.exportCSV(null);
    showToast('CSV (alle Jahre) heruntergeladen', 'success');
  });

  container.querySelector('#s-import-json')?.addEventListener('click', () => {
    container.querySelector('#s-import-file')?.click();
  });

  container.querySelector('#s-import-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Alle aktuellen Daten werden überschrieben. Fortfahren?')) return;
    try {
      await exportService.importJSON(file);
      showToast('Daten erfolgreich importiert', 'success');
      // Nach Import: Seite einmalig neu rendern um aktuellen Stand zu zeigen
      _render(container);
    } catch (err) {
      showToast('Import-Fehler: ' + err.message, 'error');
    }
  });

  // ---------------------------------------------------------------
  // Speicher
  // ---------------------------------------------------------------

  container.querySelector('#s-clear-cache')?.addEventListener('click', async () => {
    if (!('caches' in window)) { showToast('Cache API nicht verfügbar', 'error'); return; }
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    showToast('App-Cache geleert – bitte Seite neu laden', 'info');
  });

  container.querySelector('#s-clear-data')?.addEventListener('click', () => {
    if (!confirm('Wirklich ALLE Daten löschen? Nicht rückgängig machbar.')) return;
    if (!confirm('Letzter Check: Alle Aufträge und Einstellungen werden gelöscht.')) return;
    localStorage.clear();
    location.reload();
  });
}


function _storageSize() {
  try {
    const data = localStorage.getItem('nebeneinkuenfte_v1') ?? '';
    return (new Blob([data]).size / 1024).toFixed(1);
  } catch { return '–'; }
}

// Liest die E-Mail aus der gecachten Supabase-Session (synchron, kein await)
function _getCachedEmail() {
  try {
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (key) {
      const session = JSON.parse(localStorage.getItem(key));
      return session?.user?.email ?? null;
    }
  } catch {}
  return null;
}
