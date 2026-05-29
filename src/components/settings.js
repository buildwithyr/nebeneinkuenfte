/**
 * Einstellungen
 * Steuer, Kilometergeld, Sync, Export/Import, Theme
 */

import { store } from '../services/store.js';
import { syncService } from '../services/sync.js';
import { exportService } from '../services/export.js';
import { showToast } from '../app.js';
import { marginalTaxRate, formatPercent } from '../services/calculations.js';

export function renderSettings(container) {
  _render(container);
  const unsub = store.on('settings', () => _render(container));
  container._settingsUnsub = () => unsub();
}

export function destroySettings(container) {
  container._settingsUnsub?.();
}

function _render(container) {
  const { settings } = store;
  const marginal = marginalTaxRate(settings.primaryIncomeGross ?? 46000);

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
            <div class="sub">Für Grenzsteuersatz-Berechnung · Schätzung</div>
          </div>
          <input class="settings-input" type="number" id="s-primary-income"
            value="${settings.primaryIncomeGross ?? 46000}" min="0" step="500">
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Berechneter Grenzsteuersatz</div>
            <div class="sub">Österreich 2024/2025 · § 33 EStG</div>
          </div>
          <span class="settings-row-value">${formatPercent(marginal)}</span>
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
            <div class="sub">Überschreibt die automatische Berechnung</div>
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
        <span>ℹ️</span>
        <span>Alle Steuerberechnungen sind Schätzungen und dienen nur zur Orientierung. Keine steuerliche Beratung. Österreichische Grundlagenpauschale, Werbungskosten und SV-Beiträge sind nicht berücksichtigt.</span>
      </div>
    </div>

    <!-- Darstellung -->
    <div class="settings-section">
      <div class="settings-section-title">Darstellung</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Design</div>
          </div>
          <div class="toggle-group">
            <button class="toggle-btn ${settings.theme === 'dark' ? 'active' : ''}" data-theme="dark">🌙 Dark</button>
            <button class="toggle-btn ${settings.theme === 'light' ? 'active' : ''}" data-theme="light">☀️ Light</button>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Währungssymbol</div>
          </div>
          <input class="settings-input" type="text" id="s-currency-symbol"
            value="${settings.currencySymbol ?? '€'}" maxlength="3" style="width:70px;text-align:center">
        </div>
      </div>
    </div>

    <!-- GitHub Sync -->
    <div class="settings-section">
      <div class="settings-section-title">Synchronisation (Optional)</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">GitHub Personal Access Token</div>
            <div class="sub">Nur "gist" Scope nötig</div>
          </div>
        </div>
        <div class="settings-row">
          <input class="form-control" type="password" id="s-gist-token"
            placeholder="ghp_…" value="${settings.gistToken ?? ''}"
            style="font-family:var(--font-mono);font-size:0.8rem">
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Gist ID</div>
            <div class="sub">Leer lassen → Neuen Gist anlegen</div>
          </div>
        </div>
        <div class="settings-row">
          <input class="form-control" type="text" id="s-gist-id"
            placeholder="abc123…" value="${settings.gistId ?? ''}"
            style="font-family:var(--font-mono);font-size:0.8rem">
        </div>
        <div class="settings-row" style="gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm flex-1" id="s-save-sync">Speichern</button>
          <button class="btn btn-primary btn-sm flex-1" id="s-sync-now" ${syncService.isConfigured ? '' : 'disabled'}>
            🔄 Jetzt Synchronisieren
          </button>
          <button class="btn btn-secondary btn-sm flex-1" id="s-create-gist" ${settings.gistToken ? '' : 'disabled'}>
            ✨ Neuen Gist anlegen
          </button>
        </div>
        ${settings.lastSyncAt ? `
          <div class="settings-row">
            <div class="sync-indicator">
              <div class="sync-dot synced"></div>
              <span>Letzter Sync: ${new Date(settings.lastSyncAt).toLocaleString('de-AT')}</span>
            </div>
          </div>
        ` : ''}
      </div>
      <div class="info-box mt-3">
        <span>🔐</span>
        <span>Der Token wird ausschließlich lokal gespeichert und niemals an Dritte übermittelt. Erstelle einen Token unter github.com/settings/tokens mit dem Scope "gist".</span>
      </div>
    </div>

    <!-- Export / Import -->
    <div class="settings-section">
      <div class="settings-section-title">Export & Import</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">JSON-Export (Vollbackup)</div>
            <div class="sub">Alle Daten als JSON-Datei</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="s-export-json">⬇ JSON</button>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">CSV-Export (aktuelles Jahr)</div>
            <div class="sub">Für Steuer / Buchhaltung</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="s-export-csv">⬇ CSV</button>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">CSV-Export (alle Jahre)</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="s-export-csv-all">⬇ CSV Alle</button>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">JSON-Import</div>
            <div class="sub">Backup wiederherstellen – überschreibt alle Daten!</div>
          </div>
          <button class="btn btn-danger btn-sm" id="s-import-json">⬆ Import</button>
          <input type="file" id="s-import-file" accept=".json" class="hidden">
        </div>
      </div>
    </div>

    <!-- Speicher -->
    <div class="settings-section">
      <div class="settings-section-title">Speicher</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Lokale Datenmenge</div>
          </div>
          <span class="settings-row-value">${_storageSize()} KB</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Alle Daten löschen</div>
            <div class="sub">Nicht rückgängig machbar!</div>
          </div>
          <button class="btn btn-danger btn-sm" id="s-clear-data">🗑 Löschen</button>
        </div>
      </div>
    </div>

    <!-- App-Info -->
    <div class="settings-section">
      <div class="settings-section-title">Info</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-row-label"><div class="label">Version</div></div>
          <span class="settings-row-value">1.0.0</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-label">
            <div class="label">Datenquelle Steuer</div>
            <div class="sub">§ 33 EStG, Stand 2024/2025 (Orientierung, keine Beratung)</div>
          </div>
        </div>
      </div>
    </div>
  `;

  _attachListeners(container);
}

function _attachListeners(container) {
  // Einstellungen automatisch speichern (debounced)
  let saveTimer;
  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(_saveNumericSettings, 600);
  }

  function _saveNumericSettings() {
    const primaryIncome = parseFloat(container.querySelector('#s-primary-income')?.value);
    const manualRate    = parseFloat(container.querySelector('#s-manual-rate')?.value) / 100;
    const reserveRate   = parseFloat(container.querySelector('#s-reserve-rate')?.value) / 100;
    const kmRate        = parseFloat(container.querySelector('#s-km-rate')?.value);
    const currSym       = container.querySelector('#s-currency-symbol')?.value?.trim() || '€';

    const patch = {};
    if (!isNaN(primaryIncome)) patch.primaryIncomeGross = primaryIncome;
    if (!isNaN(manualRate))    patch.manualTaxRate = Math.max(0, Math.min(1, manualRate));
    if (!isNaN(reserveRate))   patch.reserveRate   = Math.max(0, Math.min(1, reserveRate));
    if (!isNaN(kmRate))        patch.kmRate        = Math.max(0, kmRate);
    patch.currencySymbol = currSym;

    store.updateSettings(patch);
  }

  ['#s-primary-income','#s-manual-rate','#s-reserve-rate','#s-km-rate','#s-currency-symbol'].forEach(sel => {
    container.querySelector(sel)?.addEventListener('input', queueSave);
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
    });
  });

  // Sync Token speichern
  container.querySelector('#s-save-sync')?.addEventListener('click', () => {
    const token = container.querySelector('#s-gist-token')?.value?.trim() ?? '';
    const gistId = container.querySelector('#s-gist-id')?.value?.trim() ?? '';
    store.updateSettings({ gistToken: token, gistId });
    showToast('Sync-Einstellungen gespeichert', 'success');
  });

  // Gist anlegen
  container.querySelector('#s-create-gist')?.addEventListener('click', async () => {
    const token = container.querySelector('#s-gist-token')?.value?.trim();
    if (!token) { showToast('Bitte Token eingeben', 'error'); return; }
    try {
      store.updateSettings({ gistToken: token });
      const id = await syncService.createGist(token);
      store.updateSettings({ gistId: id });
      showToast(`Gist angelegt: ${id}`, 'success');
    } catch (err) {
      showToast('Fehler: ' + err.message, 'error');
    }
  });

  // Sync jetzt
  container.querySelector('#s-sync-now')?.addEventListener('click', async () => {
    const btn = container.querySelector('#s-sync-now');
    btn.disabled = true;
    btn.textContent = '⏳ Synchronisiere…';
    try {
      const result = await syncService.sync();
      showToast(result.message, 'success');
    } catch (err) {
      showToast('Sync-Fehler: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 Jetzt Synchronisieren';
    }
  });

  // JSON Export
  container.querySelector('#s-export-json')?.addEventListener('click', () => {
    exportService.exportJSON();
    showToast('JSON-Backup heruntergeladen', 'success');
  });

  // CSV Export (aktuelles Jahr)
  container.querySelector('#s-export-csv')?.addEventListener('click', () => {
    exportService.exportCSV(new Date().getFullYear());
    showToast('CSV heruntergeladen', 'success');
  });

  // CSV Export (alle)
  container.querySelector('#s-export-csv-all')?.addEventListener('click', () => {
    exportService.exportCSV(null);
    showToast('CSV (alle Jahre) heruntergeladen', 'success');
  });

  // JSON Import
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
    } catch (err) {
      showToast('Import-Fehler: ' + err.message, 'error');
    }
  });

  // Alle Daten löschen
  container.querySelector('#s-clear-data')?.addEventListener('click', () => {
    if (!confirm('Wirklich ALLE Daten löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;
    if (!confirm('Bist du sicher? Alle Aufträge und Einstellungen werden gelöscht.')) return;
    localStorage.clear();
    location.reload();
  });
}

function _storageSize() {
  try {
    const key = 'nebeneinkuenfte_v1';
    const data = localStorage.getItem(key) ?? '';
    return (new Blob([data]).size / 1024).toFixed(1);
  } catch { return '–'; }
}
