/**
 * Tests für den intelligenten Matrix-Import (sheetImport.js). Ausführen: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectLayout, buildMatrixRecords, recordKey } from '../src/services/sheetImport.js';

// Beispiel aus der Anforderung
const EX_HEADERS = ['Beschreibung', 'Whitebox', 'Concertare', 'Market Mind'];
const EX_ROWS = [
  ['IQOS Anrufe', '40', '', ''],
  ['XXXLutz', '', '10', ''],
  ['Online-Diskussion', '', '', '50'],
];

test('detectLayout: Matrix erkannt (Auftraggeber als Spalten)', () => {
  const layout = detectLayout(EX_HEADERS, EX_ROWS);
  assert.equal(layout.mode, 'matrix');
  assert.equal(layout.descCol, 0);
  assert.equal(layout.kmCol, null);
  assert.deepEqual(layout.clientCols.map(c => c.name), ['Whitebox', 'Concertare', 'Market Mind']);
});

test('buildMatrixRecords: ein Datensatz je gefüllter Zelle, korrekte Zuordnung', () => {
  const layout = detectLayout(EX_HEADERS, EX_ROWS);
  const recs = buildMatrixRecords(EX_HEADERS, EX_ROWS, layout, { year: 2025 });
  assert.equal(recs.length, 3);
  assert.deepEqual(
    recs.map(r => ({ c: r.clientName, d: r.description, f: r.fee, y: r.year, s: r.status })),
    [
      { c: 'Whitebox',    d: 'IQOS Anrufe',       f: '40', y: 2025, s: 'paid' },
      { c: 'Concertare',  d: 'XXXLutz',           f: '10', y: 2025, s: 'paid' },
      { c: 'Market Mind', d: 'Online-Diskussion', f: '50', y: 2025, s: 'paid' },
    ],
  );
});

test('detectLayout: km-Spalte ganz rechts (Header "km") wird erkannt, nicht als Auftraggeber', () => {
  const headers = ['Beschreibung', 'Whitebox', 'Concertare', 'km'];
  const rows = [
    ['Fahrt A', '40', '', '120'],
    ['Fahrt B', '', '10', '15'],
  ];
  const layout = detectLayout(headers, rows);
  assert.equal(layout.mode, 'matrix');
  assert.equal(layout.kmCol, 3);
  assert.deepEqual(layout.clientCols.map(c => c.name), ['Whitebox', 'Concertare']);

  const recs = buildMatrixRecords(headers, rows, layout, { year: 2024 });
  assert.equal(recs.length, 2);
  assert.equal(recs[0].km, '120');
  assert.equal(recs[1].clientName, 'Concertare');
  assert.equal(recs[1].km, '15');
});

test('buildMatrixRecords: deutsche Komma-Beträge in Zellen', () => {
  const headers = ['Beschreibung', 'Langl & Partner'];
  const rows = [['Testkauf', '142,50']];
  const layout = detectLayout(headers, rows);
  const recs = buildMatrixRecords(headers, rows, layout, { year: 2026 });
  assert.equal(recs.length, 1);
  assert.equal(recs[0].fee, '142.5');
  assert.equal(recs[0].clientName, 'Langl & Partner');
});

test('detectLayout: mehrere Werte in einer Zeile → mehrere Datensätze', () => {
  const headers = ['Beschreibung', 'Whitebox', 'Concertare'];
  const rows = [['Doppelauftrag', '20', '30']];
  const layout = detectLayout(headers, rows);
  const recs = buildMatrixRecords(headers, rows, layout, { year: 2025 });
  assert.equal(recs.length, 2);
  assert.deepEqual(recs.map(r => `${r.clientName}:${r.fee}`), ['Whitebox:20', 'Concertare:30']);
});

test('detectLayout: normale Tabelle (mit Betrag-Spalte) ist KEIN Matrix-Layout', () => {
  const headers = ['Datum', 'Auftraggeber', 'Betrag'];
  const rows = [['12.03.2024', 'Whitebox', '40']];
  const layout = detectLayout(headers, rows);
  assert.equal(layout.mode, 'normal');
});

test('recordKey: Auftraggeber + Beschreibung + Betrag, normalisiert', () => {
  const a = recordKey({ clientName: 'Whitebox', description: 'IQOS Anrufe', fee: '40' });
  const b = recordKey({ clientName: ' whitebox ', description: 'iqos anrufe', fee: '40,00' });
  assert.equal(a, b);
});

test('detectLayout: leere Auftraggeber-Spalte stört nicht', () => {
  const headers = ['Beschreibung', 'Whitebox', 'Concertare'];
  const rows = [
    ['A', '40', ''],
    ['B', '25', ''],
  ];
  const layout = detectLayout(headers, rows);
  assert.equal(layout.mode, 'matrix');
  const recs = buildMatrixRecords(headers, rows, layout, { year: 2025 });
  assert.equal(recs.length, 2);
  assert.ok(recs.every(r => r.clientName === 'Whitebox'));
});
