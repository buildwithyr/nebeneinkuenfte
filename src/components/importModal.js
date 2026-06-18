/**
 * CSV-Import-Assistent (Modal): Datei → Vorschau & Spalten-Zuordnung → Bestätigen.
 *
 * Sicherheit: Import läuft ausschließlich über store.addAssignment/addClient,
 * d.h. die Daten gehen mit der korrekten user_id (vom eingeloggten Nutzer) und
 * unter RLS nach Supabase. Es wird NUR hinzugefügt – nie etwas überschrieben.
 */

import { store } from '../services/store.js';
import { showToast, navigate } from '../app.js';
import { escapeHtml } from '../services/calculations.js';
import {
  parseCSV, detectMapping, analyzeRows, dedupeKey, FIELD_LABELS,
} from '../services/csvImport.js';

const MAX_PREVIEW = 100;

export function openImportModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal import-modal">
      <div class="modal-handle"></div>
      <div class="modal-title">Aufträge importieren (CSV)</div>
      <div id="imp-body"></div>
    </div>`;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => {
    backdrop.classList.add('visible');
    backdrop.querySelector('.modal').classList.add('visible');
  });

  const body = backdrop.querySelector('#imp-body');

  function close() {
    backdrop.querySelector('.modal').classList.remove('visible');
    backdrop.classList.remove('visible');
    setTimeout(() => backdrop.remove(), 300);
  }
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  // ---- Schritt 1: Datei wählen ----
  let headers = [], rows = [], mapping = {};

  function renderUpload(msg) {
    body.innerHTML = `
      <p class="login-subtitle">
        CSV-Datei (UTF-8) mit alten Aufträgen wählen. In Excel/Numbers als
        „CSV UTF-8" speichern. Vorlage: <code>import-template.csv</code> im Projekt.
      </p>
      <input type="file" id="imp-file" accept=".csv,text/csv,.txt" class="form-control">
      ${msg ? `<div class="login-error" style="margin-top:var(--space-3)">${escapeHtml(msg)}</div>` : ''}
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="imp-cancel">Abbrechen</button>
      </div>`;
    body.querySelector('#imp-cancel').addEventListener('click', close);
    body.querySelector('#imp-file').addEventListener('change', onFile);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      renderUpload('Excel-Dateien werden nicht direkt unterstützt. Bitte in Excel über '
        + '„Speichern unter → CSV UTF-8" exportieren und die CSV hochladen.');
      return;
    }
    let text;
    try { text = await file.text(); }
    catch { renderUpload('Datei konnte nicht gelesen werden.'); return; }

    const parsed = parseCSV(text);
    if (!parsed.headers.length || !parsed.rows.length) {
      renderUpload('Keine Datenzeilen gefunden. Hat die Datei eine Kopfzeile und mindestens eine Zeile?');
      return;
    }
    headers = parsed.headers;
    rows = parsed.rows;
    mapping = detectMapping(headers);
    renderPreview();
  }

  // ---- Schritt 2: Zuordnung + Vorschau ----

  function existingKeys() {
    const nameById = new Map(store.clients.map(c => [c.id, c.name]));
    return new Set(store.assignments.map(a =>
      dedupeKey({ date: a.date, clientName: nameById.get(a.clientId) ?? '', fee: a.fee ?? 0 })
    ));
  }

  function renderPreview() {
    const { items, counts } = analyzeRows(headers, rows, mapping, existingKeys());

    const headerOpts = (sel) => headers.map((h, i) =>
      `<option value="${i}" ${sel === i ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('');

    const mapGrid = Object.entries(FIELD_LABELS).map(([field, label]) => `
      <label>${label}
        <select class="form-control" data-map-field="${field}">
          <option value="">(nicht zuordnen)</option>
          ${headerOpts(mapping[field])}
        </select>
      </label>`).join('');

    const shown = items.slice(0, MAX_PREVIEW);
    const tableRows = shown.map(it => {
      const cls = it.kind === 'invalid' ? 'import-row-invalid'
                : it.kind === 'duplicate' ? 'import-row-duplicate' : '';
      const badge = it.kind === 'invalid' ? '<span class="badge badge-danger">Fehler</span>'
                  : it.kind === 'duplicate' ? '<span class="badge badge-warning">Duplikat</span>'
                  : '<span class="badge badge-success">OK</span>';
      const r = it.rec;
      const detail = it.errors.length ? escapeHtml(it.errors.join('; '))
                                      : (r.year ?? '');
      return `<tr class="${cls}">
        <td>${badge}</td>
        <td>${escapeHtml(r.date ?? it.dateRaw)}</td>
        <td>${escapeHtml(r.clientName)}</td>
        <td>${escapeHtml(r.description)}</td>
        <td style="text-align:right">${r.fee != null ? r.fee.toFixed(2) : escapeHtml(it.feeRaw)}</td>
        <td style="text-align:right">${r.km || 0}</td>
        <td>${escapeHtml(r.status)}</td>
        <td>${detail}</td>
      </tr>`;
    }).join('');

    const moreNote = items.length > MAX_PREVIEW
      ? `<div class="login-subtitle">… und ${items.length - MAX_PREVIEW} weitere Zeilen (alle werden importiert).</div>` : '';

    body.innerHTML = `
      <p class="login-subtitle">Spalten-Zuordnung prüfen (Pflichtfelder *). Vorschau darunter.</p>
      <div class="import-map-grid">${mapGrid}</div>

      <div class="import-counts" style="margin:var(--space-3) 0">
        <span class="badge badge-success">${counts.valid} gültig</span>
        <span class="badge badge-warning">${counts.duplicate} Duplikate</span>
        <span class="badge badge-danger">${counts.invalid} fehlerhaft</span>
        <span class="badge badge-muted">${counts.total} gesamt</span>
      </div>

      <div class="import-preview">
        <table class="import-table">
          <thead><tr>
            <th>Status</th><th>Datum</th><th>Auftraggeber</th><th>Beschreibung</th>
            <th style="text-align:right">Betrag</th><th style="text-align:right">km</th>
            <th>Status</th><th>Jahr / Hinweis</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      ${moreNote}

      <label class="switch-row" style="margin:var(--space-2) 0">
        <span class="switch-label">Duplikate trotzdem importieren (${counts.duplicate})</span>
        <span class="switch">
          <input type="checkbox" id="imp-dups" ${counts.duplicate ? '' : 'disabled'}>
          <span class="switch-track"></span>
        </span>
      </label>

      <div class="info-box mt-2">
        <span>🔒</span>
        <span>Es werden nur neue Aufträge hinzugefügt. Bestehende Daten in Supabase
        bleiben unverändert.</span>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="imp-back">← Andere Datei</button>
        <button type="button" class="btn btn-primary" id="imp-confirm">Import bestätigen</button>
      </div>`;

    // Mapping-Änderungen → neu analysieren
    body.querySelectorAll('[data-map-field]').forEach(sel => {
      sel.addEventListener('change', () => {
        const field = sel.dataset.mapField;
        if (sel.value === '') delete mapping[field];
        else mapping[field] = Number(sel.value);
        renderPreview();
      });
    });

    body.querySelector('#imp-back').addEventListener('click', () => renderUpload());

    const confirmBtn = body.querySelector('#imp-confirm');
    const dupsCb = body.querySelector('#imp-dups');
    const updateConfirm = () => {
      const willImport = counts.valid + (dupsCb.checked ? counts.duplicate : 0);
      confirmBtn.disabled = willImport === 0;
      confirmBtn.textContent = willImport === 0
        ? 'Nichts zu importieren' : `Import bestätigen (${willImport})`;
    };
    dupsCb.addEventListener('change', updateConfirm);
    updateConfirm();

    confirmBtn.addEventListener('click', () => {
      const includeDups = dupsCb.checked;
      const willImport = counts.valid + (includeDups ? counts.duplicate : 0);
      const skipped = counts.invalid + (includeDups ? 0 : counts.duplicate);
      if (!confirm(`${willImport} Aufträge importieren${skipped ? `, ${skipped} übersprungen` : ''}.\n`
        + 'Bestehende Daten bleiben unverändert. Fortfahren?')) return;

      const n = doImport(items, includeDups);
      close();
      showToast(`${n} ${n === 1 ? 'Auftrag' : 'Aufträge'} importiert ✓`, 'success');
      navigate('dashboard'); // Dashboard inkl. 730-€-Freibetrag neu berechnen
    });
  }

  renderUpload();
}

/** Gültige (und optional Duplikat-)Zeilen in den Store/Supabase schreiben. */
function doImport(items, includeDuplicates) {
  const toImport = items.filter(i =>
    i.kind === 'valid' || (includeDuplicates && i.kind === 'duplicate'));

  // Auftraggeber per Name (case-insensitive) finden oder neu anlegen
  const clientByName = new Map(store.clients.map(c => [c.name.trim().toLowerCase(), c.id]));
  let imported = 0;

  for (const it of toImport) {
    const r = it.rec;
    let clientId = null;
    if (r.clientName) {
      const key = r.clientName.toLowerCase();
      clientId = clientByName.get(key);
      if (!clientId) {
        clientId = store.addClient({ name: r.clientName }).id;
        clientByName.set(key, clientId);
      }
    }
    store.addAssignment({
      date: r.date,
      clientId,
      description: r.description,
      fee: r.fee,
      km: r.km,
      kmBillable: r.kmBillable,
      status: r.status,
      paidDate: r.status === 'paid' ? (r.paidDate ?? r.date) : (r.paidDate ?? null),
      type: r.type || 'mystery_shopping',
      note: r.note,
    });
    imported++;
  }
  return imported;
}
