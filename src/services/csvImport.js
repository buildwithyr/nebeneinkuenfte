/**
 * CSV-Import – reine Parsing-/Mapping-/Validierungslogik (ohne DOM, testbar).
 *
 * Verarbeitet alte Aufträge (z.B. 2024/2025) aus CSV:
 *  - Delimiter-Autoerkennung (; oder , oder Tab), Quotes, UTF-8 BOM
 *  - Spalten-Autozuordnung anhand deutscher/englischer Synonyme
 *  - Beträge mit deutschem Komma (142,50) UND Punkt (142.50)
 *  - Datumsformate 12.03.2025 / 2025-03-12 / 12/03/2025
 *  - Validierung + Duplikaterkennung (innerhalb Datei und gegen Bestand)
 *
 * Die App leitet das Jahr automatisch aus dem (normalisierten) Datum ab.
 */

// ---- Feldbeschriftungen für die Mapping-UI ----
export const FIELD_LABELS = {
  year:        'Jahr',
  client:      'Auftraggeber',
  description: 'Beschreibung',
  fee:         'Betrag (€) *',
  km:          'Kilometer',
  kmBillable:  'km verrechenbar',
  status:      'Status',
  note:        'Notiz',
  date:        'Datum (optional)',
};

// ---- Synonyme für die automatische Spalten-Erkennung ----
const FIELD_SYNONYMS = {
  year:        ['jahr', 'year', 'jahre'],
  date:        ['datum', 'date', 'auftragstag', 'leistungsdatum', 'auftragsdatum'],
  client:      ['auftraggeber', 'firma', 'kunde', 'client', 'company', 'kunde/firma'],
  description: ['beschreibung', 'auftrag', 'projekt', 'titel', 'title', 'description', 'leistung', 'taetigkeit'],
  fee:         ['betrag', 'honorar', 'einnahme', 'einnahmen', 'amount', 'fee', 'summe', 'gage', 'umsatz', 'entgelt'],
  km:          ['kilometer', 'km', 'kilometers', 'strecke', 'distanz'],
  status:      ['status', 'zahlungsstatus', 'bezahlt', 'zustand'],
  note:        ['notiz', 'kommentar', 'notes', 'note', 'bemerkung', 'anmerkung', 'memo'],
  kmBillable:  ['km verrechenbar', 'verrechenbar', 'km abrechenbar', 'kmbillable'],
  paidDate:    ['zahlungsdatum', 'bezahlt am', 'paid date', 'zahlung'],
  type:        ['typ', 'type', 'art', 'kategorie'],
};

/** Header normalisieren: klein, Umlaute, Sonderzeichen/Whitespace bereinigen. */
function _norm(h) {
  return String(h ?? '').trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[€$()]/g, '').replace(/\s+/g, ' ').trim();
}

function _detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let inQ = false;
  for (const c of firstLine) {
    if (c === '"') inQ = !inQ;
    else if (!inQ && counts[c] !== undefined) counts[c]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

/**
 * CSV-Text robust parsen.
 * @returns {{ headers: string[], rows: string[][], delimiter: string }}
 */
export function parseCSV(text) {
  if (!text) return { headers: [], rows: [], delimiter: ',' };
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM entfernen
  const delimiter = _detectDelimiter(text);

  const rows = [];
  let field = '', row = [], inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ''));
  const headers = (nonEmpty.shift() ?? []).map(h => h.trim());
  return { headers, rows: nonEmpty, delimiter };
}

/**
 * Betrag parsen – deutsches Komma und englischer Punkt, Tausendertrennzeichen,
 * Währungssymbole werden toleriert.
 * @returns {number|null}
 */
export function parseAmount(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim().replace(/[^\d.,-]/g, ''); // Währung/Whitespace strippen
  if (!s) return null;

  const hasComma = s.includes(','), hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // Das zuletzt stehende Trennzeichen ist das Dezimaltrennzeichen
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = (s.match(/,/g).length > 1) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot && s.match(/\./g).length > 1) {
    s = s.replace(/\./g, ''); // "1.234.567" -> Tausenderpunkte
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function _iso(y, mo, d) {
  const Y = Number(y), M = Number(mo), D = Number(d);
  if (M < 1 || M > 12 || D < 1 || D > 31) return null;
  const dt = new Date(Date.UTC(Y, M - 1, D));
  // ungültige Daten (z.B. 31.02.) abfangen
  if (dt.getUTCFullYear() !== Y || dt.getUTCMonth() !== M - 1 || dt.getUTCDate() !== D) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${Y}-${p(M)}-${p(D)}`;
}

/**
 * Datum erkennen und nach YYYY-MM-DD normalisieren.
 * Unterstützt 2025-03-12, 12.03.2025, 12/03/2025 (Tag zuerst).
 * @returns {string|null}
 */
export function parseGermanOrIsoDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s))) return _iso(m[1], m[2], m[3]);
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s))) {
    let y = m[3];
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return _iso(y, m[2], m[1]);
  }
  return null;
}

/** Statuswert flexibel auf open|completed|paid abbilden. */
export function normalizeStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'open';
  if (/^(paid|bezahlt|ja|yes|true|1|abgerechnet)/.test(s)) return 'paid';
  if (/^(completed|abgeschlossen|erledigt|fertig|done|durchgef)/.test(s)) return 'completed';
  return 'open';
}

/** Wahrheitswert aus Text (Ja/Yes/True/1/X). */
export function parseBool(raw) {
  return /^(ja|yes|true|1|x|verrechenbar)/i.test(String(raw ?? '').trim());
}

/**
 * Spalten automatisch zuordnen.
 * @returns {Object<string, number>} field -> Spaltenindex
 */
export function detectMapping(headers) {
  const mapping = {};
  const used = new Set();
  const normHeaders = headers.map(_norm);

  const pass = (pred) => {
    for (const [field, syns] of Object.entries(FIELD_SYNONYMS)) {
      if (field in mapping) continue;
      for (let i = 0; i < normHeaders.length; i++) {
        if (used.has(i)) continue;
        if (syns.some(s => pred(normHeaders[i], _norm(s)))) { mapping[field] = i; used.add(i); break; }
      }
    }
  };
  pass((h, s) => h === s);                          // 1) exakte Übereinstimmung
  pass((h, s) => s.length >= 3 && h.includes(s));   // 2) enthält
  return mapping;
}

/**
 * Eine CSV-Zeile in einen Tracker-Datensatz + Fehlerliste umwandeln.
 *
 * Datum ist BEWUSST optional/irrelevant: das Jahr kommt aus `opts.year`
 * (Jahr-Auswahl im Assistenten); fehlt es, wird – falls vorhanden – das Jahr
 * aus einer Datumsspalte abgeleitet. Das gespeicherte Datum wird immer auf
 * den 1.1. des Jahres normiert. Eine fehlende/ungültige Datumsspalte ist KEIN
 * Fehler.
 */
export function rowToRecord(row, mapping, opts = {}) {
  const get = (field) => (mapping[field] != null ? (row[mapping[field]] ?? '') : '');
  const feeRaw = String(get('fee')).trim();
  const kmRaw  = String(get('km')).trim();

  const fee = parseAmount(feeRaw);
  const kmNum = kmRaw ? parseAmount(kmRaw) : 0;

  const yearCell = mapping.year != null ? String(get('year')).trim() : '';
  const yearFromCell = /^\d{4}$/.test(yearCell) ? Number(yearCell) : null;
  const parsedDate = mapping.date != null ? parseGermanOrIsoDate(get('date')) : null;
  const year = opts.year ?? yearFromCell ?? (parsedDate ? Number(parsedDate.slice(0, 4)) : null);
  const date = year ? `${year}-01-01` : parsedDate;

  const rec = {
    date,
    year,
    clientName: String(get('client')).trim(),
    description: String(get('description')).trim(),
    fee,
    km: Number.isFinite(kmNum) ? Math.round(kmNum) : 0,
    kmBillable: mapping.kmBillable != null ? parseBool(get('kmBillable')) : false,
    status: normalizeStatus(get('status')),
    note: String(get('note')).trim(),
    paidDate: mapping.paidDate != null ? parseGermanOrIsoDate(get('paidDate')) : null,
    type: mapping.type != null ? (String(get('type')).trim() || 'mystery_shopping') : 'mystery_shopping',
  };

  const errors = [];
  if (!feeRaw) errors.push('Betrag fehlt');
  else if (fee == null) errors.push(`Betrag ungültig: "${feeRaw}"`);
  else if (fee < 0) errors.push('Betrag negativ');

  return { rec, errors, dateRaw: mapping.date != null ? String(get('date')).trim() : '', feeRaw };
}

/** Dedupe-Schlüssel: Auftraggeber + Beschreibung + Betrag (datums-unabhängig). */
export function dedupeKey(rec) {
  const amt = parseAmount(rec.fee);
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  return `${norm(rec.clientName)}|${norm(rec.description)}|${amt != null ? amt.toFixed(2) : ''}`;
}

/**
 * Zeilen analysieren: jede Zeile als valid | invalid | duplicate einstufen.
 * @param existingKeys Set bestehender dedupeKeys (gegen Bestand)
 * @param opts { year } – Jahr für alle Zeilen (Datum wird ignoriert)
 */
export function analyzeRows(headers, rows, mapping, existingKeys = new Set(), opts = {}) {
  const seen = new Set();
  const items = rows.map((row, idx) => {
    const r = rowToRecord(row, mapping, opts);
    let kind;
    if (r.errors.length) {
      kind = 'invalid';
    } else {
      const key = dedupeKey(r.rec);
      kind = (existingKeys.has(key) || seen.has(key)) ? 'duplicate' : 'valid';
      seen.add(key);
    }
    return { line: idx + 2, kind, ...r }; // +2: Headerzeile = Zeile 1
  });

  const counts = {
    total: items.length,
    valid: items.filter(i => i.kind === 'valid').length,
    invalid: items.filter(i => i.kind === 'invalid').length,
    duplicate: items.filter(i => i.kind === 'duplicate').length,
  };
  return { items, counts };
}
