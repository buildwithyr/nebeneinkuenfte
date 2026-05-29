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
import { syncService } from '../services/sync.js';
import { exportService } from '../services/export.js';
import { showToast } from '../app.js';
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
  const hasUnsync = _hasUnsyncedChanges(settings);

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

    <!-- Synchronisation -->
    <div class="settings-section">
      <div class="settings-section-title">Synchronisation (Optional)</div>

      ${hasUnsync ? `
        <div class="info-box warning-box mb-3">
          <span>🔴</span>
          <span>Es gibt lokale Änderungen, die noch nicht synchronisiert wurden.</span>
        </div>
      ` : settings.lastSyncAt ? `
        <div class="info-box success-box mb-3">
          <span>✅</span>
          <span>Zuletzt synchronisiert: ${new Date(settings.lastSyncAt).toLocaleString('de-AT')}</span>
        </div>
      ` : ''}

      <div class="settings-card">

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">GitHub Personal Access Token</div>
            <div class="sub">Scope "gist" genügt · wird nur lokal gespeichert</div>
          </div>
        </div>
        <div class="settings-row" style="padding-top:0">
          <input class="form-control" type="password" id="s-gist-token"
            placeholder="ghp_…" value="${settings.gistToken ?? ''}"
            style="font-family:var(--font-mono);font-size:0.8rem">
        </div>

        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Gist ID</div>
            <div class="sub">Leer → Neuen Gist anlegen</div>
          </div>
        </div>
        <div class="settings-row" style="padding-top:0">
          <input class="form-control" type="text" id="s-gist-id"
            placeholder="abc123…" value="${settings.gistId ?? ''}"
            style="font-family:var(--font-mono);font-size:0.8rem">
        </div>

        <div class="settings-row" style="gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" id="s-save-sync" style="flex:1">Speichern</button>
          <button class="btn btn-primary btn-sm" id="s-sync-now" style="flex:1"
            ${syncService.isConfigured ? '' : 'disabled'}>
            🔄 Jetzt synchronisieren
          </button>
          <button class="btn btn-secondary btn-sm" id="s-create-gist" style="flex:1"
            ${settings.gistToken ? '' : 'disabled'}>
            ✨ Neuen Gist anlegen
          </button>
        </div>

      </div>

      <div class="info-box mt-3">
        <span>🔐</span>
        <span>Token wird ausschließlich im localStorage dieses Geräts gespeichert. Kein automatischer Hintergrund-Sync. Synchronisation startet nur auf Knopfdruck.</span>
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
          <span class="settings-row-value">1.0.1</span>
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
      const { marginalTaxRate } = _lazyCalc();
      marginalEl.textContent = _formatPct(marginalTaxRate(store.settings.primaryIncomeGross ?? 46000));
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
  // Sync: Nur auf expliziten Benutzer-Befehl
  // ---------------------------------------------------------------

  container.querySelector('#s-save-sync')?.addEventListener('click', () => {
    const token  = container.querySelector('#s-gist-token')?.value?.trim() ?? '';
    const gistId = container.querySelector('#s-gist-id')?.value?.trim() ?? '';
    store.updateSettings({ gistToken: token, gistId });
    // Sync-Button aktivieren/deaktivieren
    const syncBtn = container.querySelector('#s-sync-now');
    if (syncBtn) syncBtn.disabled = !(token && gistId);
    showToast('Sync-Einstellungen gespeichert', 'success');
  });

  container.querySelector('#s-create-gist')?.addEventListener('click', async (e) => {
    const btn   = e.currentTarget;
    const token = container.querySelector('#s-gist-token')?.value?.trim();
    if (!token) { showToast('Bitte Token eingeben', 'error'); return; }

    btn.disabled = true;
    btn.textContent = '⏳ Anlegen…';
    try {
      store.updateSettings({ gistToken: token });
      const id = await syncService.createGist(token);
      store.updateSettings({ gistId: id });
      // Gist-ID Feld befüllen ohne Seite neu zu laden
      const idInput = container.querySelector('#s-gist-id');
      if (idInput) idInput.value = id;
      const syncBtn = container.querySelector('#s-sync-now');
      if (syncBtn) syncBtn.disabled = false;
      showToast(`Gist angelegt: ${id}`, 'success');
    } catch (err) {
      showToast('Fehler: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Neuen Gist anlegen';
    }
  });

  container.querySelector('#s-sync-now')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '⏳ Synchronisiere…';
    try {
      // Sicherstellen, dass aktuelle Tokenwerte verwendet werden
      const token  = container.querySelector('#s-gist-token')?.value?.trim() ?? store.settings.gistToken;
      const gistId = container.querySelector('#s-gist-id')?.value?.trim() ?? store.settings.gistId;
      if (token !== store.settings.gistToken || gistId !== store.settings.gistId) {
        store.updateSettings({ gistToken: token, gistId });
      }

      const result = await syncService.sync();
      showToast(result.message, 'success');

      // Sync-Status im DOM aktualisieren ohne vollständigen Rebuild
      _updateSyncStatus(container, store.settings);
    } catch (err) {
      showToast('Sync-Fehler: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 Jetzt synchronisieren';
    }
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

/** Sync-Status-Box im DOM aktualisieren ohne HTML-Rebuild */
function _updateSyncStatus(container, settings) {
  // Kein direkter Zugriff auf spezifische Status-Div-Elemente nötig –
  // einfach den Abschnitt über der Sync-Card aktualisieren
  const section = container.querySelector('.settings-section:nth-child(3)');
  if (!section) return;

  const hasUnsync = _hasUnsyncedChanges(settings);
  let infoBox = section.querySelector('.info-box.mb-3');

  const html = hasUnsync
    ? `<div class="info-box warning-box mb-3"><span>🔴</span><span>Es gibt lokale Änderungen, die noch nicht synchronisiert wurden.</span></div>`
    : settings.lastSyncAt
    ? `<div class="info-box success-box mb-3"><span>✅</span><span>Zuletzt synchronisiert: ${new Date(settings.lastSyncAt).toLocaleString('de-AT')}</span></div>`
    : '';

  if (infoBox) {
    infoBox.outerHTML = html;
  } else if (html) {
    section.querySelector('.settings-card')?.insertAdjacentHTML('beforebegin', html);
  }
}

/** Prüft ob lokale Daten neuer als letzter Sync sind */
function _hasUnsyncedChanges(settings) {
  if (!settings.lastSyncAt) return false;
  const lastSync   = new Date(settings.lastSyncAt).getTime();
  const lastModified = new Date(store.meta?.lastModified ?? 0).getTime();
  return lastModified > lastSync;
}

function _storageSize() {
  try {
    const data = localStorage.getItem('nebeneinkuenfte_v1') ?? '';
    return (new Blob([data]).size / 1024).toFixed(1);
  } catch { return '–'; }
}

// Lazy-import von calculations um zirkuläre Abhängigkeiten zu vermeiden
function _lazyCalc() {
  return { marginalTaxRate };
}

function _formatPct(rate) {
  return `${(rate * 100).toFixed(1)} %`;
}
