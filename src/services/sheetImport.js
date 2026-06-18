/**
 * "Intelligenter" Tabellen-Import – erkennt NICHT-normierte Layouts (ohne DOM).
 *
 * Speziell das Matrix-Layout, bei dem Auftraggeber als SPALTEN stehen und der
 * Betrag in genau einer dieser Spalten pro Zeile:
 *
 *   | Beschreibung      | Whitebox | Concertare | Market Mind |
 *   | IQOS Anrufe       | 40       |            |             |
 *   | XXXLutz           |          | 10         |             |
 *
 * Ergebnis: je gefüllter Auftraggeber-Zelle ein Datensatz
 * (Auftraggeber = Spaltenüberschrift, Beschreibung = erste Spalte, Betrag = Wert).
 *
 * Diese Dateien enthalten KEIN Datum – das Jahr wird im Assistenten gewählt.
 */

import { parseAmount } from './csvImport.js';

const KM_HEADERS   = ['km', 'kilometer', 'kilometers', 'strecke', 'distanz', 'gefahrene km'];
const DESC_HEADERS = ['beschreibung', 'auftrag', 'projekt', 'titel', 'title', 'description',
                      'leistung', 'taetigkeit', 'position', 'bezeichnung', 'tätigkeit'];

function _norm(s) {
  return String(s ?? '').trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ').trim();
}

function _cell(rows, r, c) { return String(rows[r]?.[c] ?? '').trim(); }

function _numericFraction(rows, col) {
  let nonEmpty = 0, numeric = 0;
  for (let r = 0; r < rows.length; r++) {
    const v = _cell(rows, r, col);
    if (!v) continue;
    nonEmpty++;
    if (parseAmount(v) != null) numeric++;
  }
  return nonEmpty ? numeric / nonEmpty : 0;
}

function _textFraction(rows, col) {
  let nonEmpty = 0, text = 0;
  for (let r = 0; r < rows.length; r++) {
    const v = _cell(rows, r, col);
    if (!v) continue;
    nonEmpty++;
    if (parseAmount(v) == null) text++;
  }
  return nonEmpty ? text / nonEmpty : 0;
}

function _isFilled(rows, col) {
  return rows.some((_, r) => _cell(rows, r, col) !== '');
}

/**
 * Layout erkennen.
 * @returns {{ mode:'matrix'|'normal', descCol:number, kmCol:number|null, clientCols:{index:number,name:string}[] }}
 */
export function detectLayout(headers, rows) {
  const n = headers.length;

  // Beschreibungsspalte: per Header erkennen, sonst die erste Spalte
  let descCol = headers.findIndex(h => DESC_HEADERS.includes(_norm(h)));
  if (descCol === -1) descCol = 0;

  // Kilometer-Spalte: per Header erkennen, sonst letzte Spalte falls Header leer + numerisch
  let kmCol = headers.findIndex(h => KM_HEADERS.includes(_norm(h)));
  if (kmCol === -1) {
    const last = n - 1;
    if (last !== descCol && _norm(headers[last]) === '' && _numericFraction(rows, last) >= 0.6) {
      kmCol = last;
    }
  }

  // Auftraggeber-Spalten: alles außer Beschreibung/km mit nicht-leerem Header
  const clientCols = [];
  for (let i = 0; i < n; i++) {
    if (i === descCol || i === kmCol) continue;
    const name = String(headers[i] ?? '').trim();
    if (name) clientCols.push({ index: i, name });
  }

  // Matrix, wenn: Beschreibungsspalte überwiegend Text, ≥1 Auftraggeber-Spalte,
  // und alle Auftraggeber-Spalten numerisch ODER leer (Beträge je Zelle).
  const allNumericOrEmpty = clientCols.every(
    c => !_isFilled(rows, c.index) || _numericFraction(rows, c.index) >= 0.6
  );
  const someFilled = clientCols.some(c => _isFilled(rows, c.index));
  const isMatrix = clientCols.length >= 1
    && _textFraction(rows, descCol) >= 0.5
    && allNumericOrEmpty
    && someFilled;

  return { mode: isMatrix ? 'matrix' : 'normal', descCol, kmCol: kmCol === -1 ? null : kmCol, clientCols };
}

/**
 * Aus Matrix-Layout editierbare Datensätze bauen – ein Datensatz je gefüllter
 * Auftraggeber-Zelle. Beträge als Strings (für die editierbare Vorschau).
 */
export function buildMatrixRecords(headers, rows, layout, opts = {}) {
  const { descCol, kmCol, clientCols } = layout;
  const year   = opts.year ?? new Date().getFullYear();
  const status = opts.defaultStatus ?? 'paid';
  const out = [];

  for (let r = 0; r < rows.length; r++) {
    const description = _cell(rows, r, descCol);
    const kmRaw = kmCol != null ? _cell(rows, r, kmCol) : '';
    const km = kmRaw ? String(Math.round(parseAmount(kmRaw) ?? 0)) : '';

    for (const cc of clientCols) {
      const raw = _cell(rows, r, cc.index);
      if (!raw) continue;
      const amt = parseAmount(raw);
      if (amt == null) continue;
      out.push({
        clientName: cc.name,
        description,
        fee: String(amt),  // editierbar als Text
        km,
        year,
        status,
      });
    }
  }
  return out;
}

/** Dedupe-Schlüssel: Auftraggeber + Beschreibung + Betrag (gemäß Anforderung). */
export function recordKey({ clientName, description, fee }) {
  const amt = parseAmount(fee);
  return `${_norm(clientName)}|${_norm(description)}|${amt != null ? amt.toFixed(2) : ''}`;
}
