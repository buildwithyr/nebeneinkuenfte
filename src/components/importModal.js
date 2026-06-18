/**
 * Import-Assistent (Modal) für CSV **und** Excel (.xlsx/.xls).
 *
 * Zwei Layouts werden automatisch erkannt:
 *  - "normal": Spalten wie Datum/Auftraggeber/Betrag … (mit Spalten-Mapping)
 *  - "matrix": Auftraggeber als Spalten, Betrag je Zelle, KEIN Datum →
 *    Jahr wird gewählt, Standardstatus = Bezahlt, Vorschau editierbar.
 *
 * Sicherheit: Import läuft ausschließlich über store.addAssignment/addClient
 * (korrekte user_id, RLS aktiv). Es wird nur hinzugefügt, nie überschrieben.
 * Geschrieben wird erst nach Klick auf „Import bestätigen".
 */

import { store } from '../services/store.js';
import { showToast, navigate } from '../app.js';
import { escapeHtml } from '../services/calculations.js';
import {
  parseCSV, detectMapping, analyzeRows, dedupeKey, parseAmount, FIELD_LABELS,
} from '../services/csvImport.js';
import { detectLayout, buildMatrixRecords, recordKey } from '../services/sheetImport.js';

const MAX_PREVIEW = 100;
const YEARS = (() => { const now = new Date().getFullYear(); const a = []; for (let y = now; y >= 2020; y--) a.push(y); return a; })();
const DEFAULT_YEAR = new Date().getFullYear();

/** Jahr aus einer "Jahr"-Spalte ableiten (erste 4-stellige Zahl), sonst aktuelles Jahr. */
function defaultYearFromData(rows, yearCol) {
  if (yearCol != null) {
    for (const r of rows) {
      const v = String(r[yearCol] ?? '').trim();
      if (/^\d{4}$/.test(v)) return Number(v);
    }
  }
  return DEFAULT_YEAR;
}

/** SheetJS (xlsx) erst bei Bedarf nachladen – hält den App-Start schlank. */
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'assets/vendor/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('Excel-Bibliothek konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
}

export function openImportModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal import-modal">
      <div class="modal-handle"></div>
      <div class="modal-title">Aufträge importieren</div>
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

  // gemeinsamer Zustand
  let headers = [], rows = [], mapping = {};

  // ---------------- Schritt 1: Datei wählen ----------------
  function renderUpload(msg) {
    body.innerHTML = `
      <p class="login-subtitle">
        Datei wählen – <strong>CSV</strong>, <strong>.xlsx</strong> oder <strong>.xls</strong>.
        Tabellen müssen nicht normiert sein; Spalten werden automatisch erkannt.
        Vorlage: <code>import-template.csv</code>.
      </p>
      <input type="file" id="imp-file" accept=".csv,.xlsx,.xls,text/csv" class="form-control">
      ${msg ? `<div class="login-error" style="margin-top:var(--space-3)">${escapeHtml(msg)}</div>` : ''}
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="imp-cancel">Abbrechen</button>
      </div>`;
    body.querySelector('#imp-cancel').addEventListener('click', close);
    body.querySelector('#imp-file').addEventListener('change', onFile);
  }

  async function readFile(file) {
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      const nonEmpty = aoa.filter(r => r.some(c => String(c).trim() !== ''));
      const hdr = (nonEmpty.shift() ?? []).map(h => String(h).trim());
      return { headers: hdr, rows: nonEmpty.map(r => r.map(c => String(c))) };
    }
    const parsed = parseCSV(await file.text());
    return { headers: parsed.headers, rows: parsed.rows };
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    let parsed;
    try { parsed = await readFile(file); }
    catch (err) { renderUpload(err.message ?? 'Datei konnte nicht gelesen werden.'); return; }

    if (!parsed.headers.length || !parsed.rows.length) {
      renderUpload('Keine Datenzeilen gefunden. Hat die Datei eine Kopfzeile und mindestens eine Zeile?');
      return;
    }
    headers = parsed.headers;
    rows = parsed.rows;

    const mapping0 = detectMapping(headers);
    const layout = detectLayout(headers, rows);

    if (layout.mode === 'matrix' && mapping0.fee == null) {
      renderMatrix(layout);
    } else {
      mapping = mapping0;
      normalYear = defaultYearFromData(rows, mapping.year); // aus "Jahr"-Spalte, sonst aktuelles Jahr
      renderNormalPreview();
    }
  }

  // ---------------- Matrix-Layout (Auftraggeber als Spalten) ----------------

  function matrixExistingKeys() {
    const nameById = new Map(store.clients.map(c => [c.id, c.name]));
    return new Set(store.assignments.map(a =>
      recordKey({ clientName: nameById.get(a.clientId) ?? '', description: a.description ?? '', fee: a.fee ?? 0 })));
  }

  function renderMatrix(layout) {
    let edit = buildMatrixRecords(headers, rows, layout, { year: DEFAULT_YEAR, defaultStatus: 'paid' });

    const yearOpts = (sel) => YEARS.map(y => `<option value="${y}" ${Number(sel) === y ? 'selected' : ''}>${y}</option>`).join('');
    const statusOpts = (sel) => [['paid', '💰 Bezahlt'], ['completed', '✓ Abgeschlossen'], ['open', '📋 Offen']]
      .map(([v, l]) => `<option value="${v}" ${sel === v ? 'selected' : ''}>${l}</option>`).join('');

    function classify() {
      const existing = matrixExistingKeys();
      const seen = new Set();
      return edit.map(r => {
        const fee = parseAmount(r.fee);
        if (!String(r.clientName).trim() || fee == null) return 'invalid';
        const key = recordKey(r);
        const kind = (existing.has(key) || seen.has(key)) ? 'duplicate' : 'valid';
        seen.add(key);
        return kind;
      });
    }

    function rowHtml(r, i) {
      return `<tr data-idx="${i}">
        <td class="imp-badge"></td>
        <td><input class="form-control" data-field="clientName" value="${escapeHtml(r.clientName)}"></td>
        <td><input class="form-control" data-field="description" value="${escapeHtml(r.description)}"></td>
        <td><input class="form-control" data-field="fee" style="text-align:right" value="${escapeHtml(r.fee)}"></td>
        <td><input class="form-control" data-field="km" style="text-align:right" value="${escapeHtml(r.km)}"></td>
        <td><select class="form-control" data-field="year">${yearOpts(r.year)}</select></td>
        <td><select class="form-control" data-field="status">${statusOpts(r.status)}</select></td>
      </tr>`;
    }

    const clientList = layout.clientCols.map(c => escapeHtml(c.name)).join(', ');
    const descName = escapeHtml(headers[layout.descCol] ?? '(erste Spalte)');
    const kmName = layout.kmCol != null ? escapeHtml(headers[layout.kmCol] || 'letzte Spalte') : '–';

    body.innerHTML = `
      <div class="info-box mb-2">
        <span>🧠</span>
        <span>Matrix-Layout erkannt. <strong>Beschreibung:</strong> ${descName} ·
        <strong>Auftraggeber (Spalten):</strong> ${clientList} · <strong>km:</strong> ${kmName}.
        Diese Dateien haben kein Datum – wähle das Jahr. Alle Zeilen sind editierbar.</span>
      </div>

      <div class="import-controls">
        <label>Jahr (für alle)
          <select class="form-control" id="imp-year">${yearOpts(DEFAULT_YEAR)}</select>
        </label>
        <label>Status (für alle)
          <select class="form-control" id="imp-status">${statusOpts('paid')}</select>
        </label>
      </div>

      <div class="import-counts" id="imp-counts" style="margin:var(--space-3) 0"></div>

      <div class="import-preview">
        <table class="import-table">
          <thead><tr>
            <th></th><th>Auftraggeber</th><th>Beschreibung</th>
            <th style="text-align:right">Betrag</th><th style="text-align:right">km</th>
            <th>Jahr</th><th>Status</th>
          </tr></thead>
          <tbody id="imp-tbody">${edit.slice(0, MAX_PREVIEW).map(rowHtml).join('')}</tbody>
        </table>
      </div>
      ${edit.length > MAX_PREVIEW ? `<div class="login-subtitle">… ${edit.length - MAX_PREVIEW} weitere (alle werden importiert).</div>` : ''}

      <label class="switch-row" style="margin:var(--space-2) 0">
        <span class="switch-label">Als Duplikat markierte trotzdem importieren</span>
        <span class="switch"><input type="checkbox" id="imp-dups"><span class="switch-track"></span></span>
      </label>

      <div class="info-box mt-2"><span>🔒</span><span>Nur neue Aufträge werden hinzugefügt – Bestand bleibt unverändert.</span></div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="imp-back">← Andere Datei</button>
        <button type="button" class="btn btn-primary" id="imp-confirm">Import bestätigen</button>
      </div>`;

    const tbody = body.querySelector('#imp-tbody');
    const countsEl = body.querySelector('#imp-counts');
    const confirmBtn = body.querySelector('#imp-confirm');
    const dupsCb = body.querySelector('#imp-dups');

    function refresh() {
      const kinds = classify();
      const counts = {
        valid: kinds.filter(k => k === 'valid').length,
        duplicate: kinds.filter(k => k === 'duplicate').length,
        invalid: kinds.filter(k => k === 'invalid').length,
      };
      // Badges der sichtbaren Zeilen aktualisieren
      tbody.querySelectorAll('tr').forEach(tr => {
        const k = kinds[Number(tr.dataset.idx)];
        tr.className = k === 'invalid' ? 'import-row-invalid' : k === 'duplicate' ? 'import-row-duplicate' : '';
        const badge = k === 'invalid' ? '<span class="badge badge-danger">Fehler</span>'
          : k === 'duplicate' ? '<span class="badge badge-warning">Duplikat</span>'
          : '<span class="badge badge-success">OK</span>';
        tr.querySelector('.imp-badge').innerHTML = badge;
      });
      countsEl.innerHTML = `
        <span class="badge badge-success">${counts.valid} gültig</span>
        <span class="badge badge-warning">${counts.duplicate} Duplikate</span>
        <span class="badge badge-danger">${counts.invalid} fehlerhaft</span>
        <span class="badge badge-muted">${edit.length} gesamt</span>`;
      const willImport = counts.valid + (dupsCb.checked ? counts.duplicate : 0);
      confirmBtn.disabled = willImport === 0;
      confirmBtn.textContent = willImport === 0 ? 'Nichts zu importieren' : `Import bestätigen (${willImport})`;
      return { counts, willImport };
    }

    // Inline-Edits
    tbody.addEventListener('input', (e) => {
      const tr = e.target.closest('tr'); if (!tr) return;
      edit[Number(tr.dataset.idx)][e.target.dataset.field] = e.target.value;
      refresh();
    });
    tbody.addEventListener('change', (e) => {
      const tr = e.target.closest('tr'); if (!tr) return;
      edit[Number(tr.dataset.idx)][e.target.dataset.field] = e.target.value;
      refresh();
    });

    // Globale Jahr-/Status-Auswahl auf alle Zeilen anwenden
    body.querySelector('#imp-year').addEventListener('change', (e) => {
      const y = Number(e.target.value);
      edit.forEach(r => { r.year = y; });
      tbody.querySelectorAll('select[data-field="year"]').forEach(s => { s.value = String(y); });
      refresh();
    });
    body.querySelector('#imp-status').addEventListener('change', (e) => {
      const st = e.target.value;
      edit.forEach(r => { r.status = st; });
      tbody.querySelectorAll('select[data-field="status"]').forEach(s => { s.value = st; });
      refresh();
    });

    dupsCb.addEventListener('change', refresh);
    body.querySelector('#imp-back').addEventListener('click', () => renderUpload());

    confirmBtn.addEventListener('click', () => {
      const kinds = classify();
      const includeDups = dupsCb.checked;
      const toImport = edit.filter((_, i) => kinds[i] === 'valid' || (includeDups && kinds[i] === 'duplicate'));
      const skipped = edit.length - toImport.length;
      if (!toImport.length) return;
      if (!confirm(`${toImport.length} Aufträge importieren${skipped ? `, ${skipped} übersprungen` : ''}.\n`
        + 'Bestehende Daten bleiben unverändert. Fortfahren?')) return;

      const n = importMatrix(toImport);
      close();
      showToast(`${n} ${n === 1 ? 'Auftrag' : 'Aufträge'} importiert ✓`, 'success');
      navigate('dashboard'); // Dashboard inkl. 730-€-Freibetrag neu berechnen
    });

    refresh();
  }

  // ---------------- Normales Layout (mit Spalten-Mapping) ----------------

  function normalExistingKeys() {
    const nameById = new Map(store.clients.map(c => [c.id, c.name]));
    return new Set(store.assignments.map(a =>
      dedupeKey({ clientName: nameById.get(a.clientId) ?? '', description: a.description ?? '', fee: a.fee ?? 0 })));
  }

  let normalYear = DEFAULT_YEAR;

  function renderNormalPreview() {
    const { items, counts } = analyzeRows(headers, rows, mapping, normalExistingKeys(), { year: normalYear });

    const headerOpts = (sel) => headers.map((h, i) =>
      `<option value="${i}" ${sel === i ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('');
    const mapGrid = Object.entries(FIELD_LABELS).map(([field, label]) => `
      <label>${label}
        <select class="form-control" data-map-field="${field}">
          <option value="">(nicht zuordnen)</option>${headerOpts(mapping[field])}
        </select>
      </label>`).join('');
    const yearOpts = YEARS.map(y => `<option value="${y}" ${y === normalYear ? 'selected' : ''}>${y}</option>`).join('');

    const tableRows = items.slice(0, MAX_PREVIEW).map(it => {
      const cls = it.kind === 'invalid' ? 'import-row-invalid' : it.kind === 'duplicate' ? 'import-row-duplicate' : '';
      const badge = it.kind === 'invalid' ? '<span class="badge badge-danger">Fehler</span>'
        : it.kind === 'duplicate' ? '<span class="badge badge-warning">Duplikat</span>'
        : '<span class="badge badge-success">OK</span>';
      const r = it.rec;
      const detail = it.errors.length ? escapeHtml(it.errors.join('; ')) : '';
      return `<tr class="${cls}">
        <td>${badge}</td><td>${r.year ?? ''}</td><td>${escapeHtml(r.clientName)}</td>
        <td>${escapeHtml(r.description)}</td><td style="text-align:right">${r.fee != null ? r.fee.toFixed(2) : escapeHtml(it.feeRaw)}</td>
        <td style="text-align:right">${r.km || 0}</td><td>${escapeHtml(r.status)}</td><td>${detail}</td>
      </tr>`;
    }).join('');

    body.innerHTML = `
      <p class="login-subtitle">Spalten-Zuordnung prüfen (Pflichtfeld: Betrag). Das Datum ist irrelevant – wähle nur das Jahr.</p>
      <div class="import-controls">
        <label>Jahr (für alle)
          <select class="form-control" id="imp-year">${yearOpts}</select>
        </label>
      </div>
      <div class="import-map-grid" style="margin-top:var(--space-3)">${mapGrid}</div>
      <div class="import-counts" style="margin:var(--space-3) 0">
        <span class="badge badge-success">${counts.valid} gültig</span>
        <span class="badge badge-warning">${counts.duplicate} Duplikate</span>
        <span class="badge badge-danger">${counts.invalid} fehlerhaft</span>
        <span class="badge badge-muted">${counts.total} gesamt</span>
      </div>
      <div class="import-preview">
        <table class="import-table">
          <thead><tr><th>Status</th><th>Jahr</th><th>Auftraggeber</th><th>Beschreibung</th>
          <th style="text-align:right">Betrag</th><th style="text-align:right">km</th><th>Status</th><th>Hinweis</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      ${items.length > MAX_PREVIEW ? `<div class="login-subtitle">… ${items.length - MAX_PREVIEW} weitere (alle werden importiert).</div>` : ''}
      <label class="switch-row" style="margin:var(--space-2) 0">
        <span class="switch-label">Duplikate trotzdem importieren (${counts.duplicate})</span>
        <span class="switch"><input type="checkbox" id="imp-dups" ${counts.duplicate ? '' : 'disabled'}><span class="switch-track"></span></span>
      </label>
      <div class="info-box mt-2"><span>🔒</span><span>Nur neue Aufträge werden hinzugefügt – Bestand bleibt unverändert.</span></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="imp-back">← Andere Datei</button>
        <button type="button" class="btn btn-primary" id="imp-confirm">Import bestätigen</button>
      </div>`;

    body.querySelector('#imp-year').addEventListener('change', (e) => {
      normalYear = Number(e.target.value);
      renderNormalPreview();
    });
    body.querySelectorAll('[data-map-field]').forEach(sel => {
      sel.addEventListener('change', () => {
        const field = sel.dataset.mapField;
        if (sel.value === '') delete mapping[field]; else mapping[field] = Number(sel.value);
        renderNormalPreview();
      });
    });
    body.querySelector('#imp-back').addEventListener('click', () => renderUpload());

    const confirmBtn = body.querySelector('#imp-confirm');
    const dupsCb = body.querySelector('#imp-dups');
    const updateConfirm = () => {
      const willImport = counts.valid + (dupsCb.checked ? counts.duplicate : 0);
      confirmBtn.disabled = willImport === 0;
      confirmBtn.textContent = willImport === 0 ? 'Nichts zu importieren' : `Import bestätigen (${willImport})`;
    };
    dupsCb.addEventListener('change', updateConfirm);
    updateConfirm();

    confirmBtn.addEventListener('click', () => {
      const includeDups = dupsCb.checked;
      const toImport = items.filter(i => i.kind === 'valid' || (includeDups && i.kind === 'duplicate'));
      const skipped = counts.invalid + (includeDups ? 0 : counts.duplicate);
      if (!toImport.length) return;
      if (!confirm(`${toImport.length} Aufträge importieren${skipped ? `, ${skipped} übersprungen` : ''}.\n`
        + 'Bestehende Daten bleiben unverändert. Fortfahren?')) return;
      const n = importNormal(toImport);
      close();
      showToast(`${n} ${n === 1 ? 'Auftrag' : 'Aufträge'} importiert ✓`, 'success');
      navigate('dashboard');
    });
  }

  renderUpload();
}

// ---------------- Schreiben in Store/Supabase ----------------

function resolveClientId(name, cache) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  let id = cache.get(key);
  if (!id) { id = store.addClient({ name: name.trim() }).id; cache.set(key, id); }
  return id;
}

function importMatrix(records) {
  const cache = new Map(store.clients.map(c => [c.name.trim().toLowerCase(), c.id]));
  let n = 0;
  for (const r of records) {
    const date = `${r.year}-01-01`;
    store.addAssignment({
      date,
      clientId: resolveClientId(r.clientName, cache),
      description: String(r.description ?? '').trim(),
      fee: parseAmount(r.fee) ?? 0,
      km: Math.round(parseAmount(r.km) ?? 0),
      kmBillable: false,
      status: r.status || 'paid',
      paidDate: (r.status || 'paid') === 'paid' ? date : null,
      type: 'mystery_shopping',
      note: '',
    });
    n++;
  }
  return n;
}

function importNormal(items) {
  const cache = new Map(store.clients.map(c => [c.name.trim().toLowerCase(), c.id]));
  let n = 0;
  for (const it of items) {
    const r = it.rec;
    store.addAssignment({
      date: r.date,
      clientId: resolveClientId(r.clientName, cache),
      description: r.description,
      fee: r.fee,
      km: r.km,
      kmBillable: r.kmBillable,
      status: r.status,
      paidDate: r.status === 'paid' ? (r.paidDate ?? r.date) : (r.paidDate ?? null),
      type: r.type || 'mystery_shopping',
      note: r.note,
    });
    n++;
  }
  return n;
}
