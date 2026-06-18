/**
 * Tests für die CSV-Import-Logik (csvImport.js). Ausführen: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCSV, parseAmount, parseGermanOrIsoDate, normalizeStatus, parseBool,
  detectMapping, rowToRecord, dedupeKey, analyzeRows,
} from '../src/services/csvImport.js';

// ---- parseAmount: deutsches Komma & Co. ----

test('parseAmount: deutsches Komma 142,50 → 142.5', () => {
  assert.equal(parseAmount('142,50'), 142.5);
});
test('parseAmount: englischer Punkt 142.50 → 142.5', () => {
  assert.equal(parseAmount('142.50'), 142.5);
});
test('parseAmount: Tausenderpunkt + Komma 1.234,56 → 1234.56', () => {
  assert.equal(parseAmount('1.234,56'), 1234.56);
});
test('parseAmount: Tausenderkomma + Punkt 1,234.56 → 1234.56', () => {
  assert.equal(parseAmount('1,234.56'), 1234.56);
});
test('parseAmount: Währung/Whitespace toleriert', () => {
  assert.equal(parseAmount(' € 32 '), 32);
  assert.equal(parseAmount('30,00 EUR'), 30);
});
test('parseAmount: leer/ungültig → null', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(null), null);
});

// ---- parseGermanOrIsoDate: drei Formate ----

test('parseGermanOrIsoDate: alle geforderten Formate → YYYY-MM-DD', () => {
  assert.equal(parseGermanOrIsoDate('12.03.2025'), '2025-03-12');
  assert.equal(parseGermanOrIsoDate('2025-03-12'), '2025-03-12');
  assert.equal(parseGermanOrIsoDate('12/03/2025'), '2025-03-12');
});
test('parseGermanOrIsoDate: ungültiges Datum → null', () => {
  assert.equal(parseGermanOrIsoDate('31.02.2025'), null);
  assert.equal(parseGermanOrIsoDate('foo'), null);
  assert.equal(parseGermanOrIsoDate(''), null);
});

// ---- status / bool ----

test('normalizeStatus: deutsch/englisch', () => {
  assert.equal(normalizeStatus('bezahlt'), 'paid');
  assert.equal(normalizeStatus('abgeschlossen'), 'completed');
  assert.equal(normalizeStatus('offen'), 'open');
  assert.equal(normalizeStatus(''), 'open');
  assert.equal(normalizeStatus('paid'), 'paid');
});
test('parseBool', () => {
  assert.equal(parseBool('Ja'), true);
  assert.equal(parseBool('nein'), false);
  assert.equal(parseBool('1'), true);
});

// ---- detectMapping: deutsche Spaltennamen ----

test('detectMapping: erkennt deutsche Header', () => {
  const m = detectMapping(['Datum', 'Auftraggeber', 'Beschreibung', 'Betrag', 'Kilometer', 'Status', 'Notiz']);
  assert.equal(m.date, 0);
  assert.equal(m.client, 1);
  assert.equal(m.description, 2);
  assert.equal(m.fee, 3);
  assert.equal(m.km, 4);
  assert.equal(m.status, 5);
  assert.equal(m.note, 6);
});

test('detectMapping: "km" greift NICHT die Spalte "km verrechenbar" ab', () => {
  const m = detectMapping(['Datum', 'Honorar (€)', 'km', 'km verrechenbar']);
  assert.equal(m.fee, 1);
  assert.equal(m.km, 2);
  assert.equal(m.kmBillable, 3);
});

// ---- parseCSV: Delimiter & Quotes ----

test('parseCSV: Semikolon-Delimiter + BOM + Quotes', () => {
  const text = '﻿Datum;Auftraggeber;Notiz\r\n12.03.2024;Whitebox;"Wien; Mitte"\r\n';
  const { headers, rows, delimiter } = parseCSV(text);
  assert.equal(delimiter, ';');
  assert.deepEqual(headers, ['Datum', 'Auftraggeber', 'Notiz']);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], ['12.03.2024', 'Whitebox', 'Wien; Mitte']);
});

// ---- End-to-end: analyzeRows (2024/2025, Komma, leere Felder, Duplikate) ----

function analyzeCsv(text, existingKeys, opts) {
  const { headers, rows } = parseCSV(text);
  const mapping = detectMapping(headers);
  return analyzeRows(headers, rows, mapping, existingKeys, opts);
}

test('analyzeRows: 2024- und 2025-Daten, Komma-Beträge, Jahr aus Datum', () => {
  const csv = [
    'Datum;Auftraggeber;Beschreibung;Betrag;Kilometer;Status;Notiz',
    '12.03.2024;Whitebox;IQOS Wien;142,50;110;bezahlt;Test',
    '2025-03-12;Concertare;Mystery Call;30,00;0;offen;',
  ].join('\n');
  const { items, counts } = analyzeCsv(csv);
  assert.equal(counts.valid, 2);
  assert.equal(counts.invalid, 0);
  assert.equal(items[0].rec.fee, 142.5);
  assert.equal(items[0].rec.year, 2024);
  assert.equal(items[0].rec.status, 'paid');
  assert.equal(items[1].rec.year, 2025);
});

test('analyzeRows: Datum ist irrelevant – nur Betrag ist Pflicht', () => {
  const csv = [
    'Auftraggeber;Beschreibung;Betrag',
    'Concertare;Porsche Graz;100,00',  // KEINE Datumsspalte → trotzdem gültig
    'Whitebox;Mystery;',               // Betrag fehlt → invalid
    'Whitebox;Foo;abc',                // Betrag ungültig → invalid
  ].join('\n');
  const { counts, items } = analyzeCsv(csv, new Set(), { year: 2025 });
  assert.equal(counts.valid, 1);
  assert.equal(counts.invalid, 2);
  assert.equal(items[0].rec.year, 2025);
  assert.equal(items[0].rec.date, '2025-01-01'); // auf 1.1. des gewählten Jahres normiert
  assert.ok(items[1].errors.some(e => e.includes('Betrag')));
});

test('analyzeRows: gewähltes Jahr überschreibt vorhandene Datumsspalte', () => {
  const csv = [
    'Datum;Auftraggeber;Betrag',
    '12.03.2024;Whitebox;40,00',
  ].join('\n');
  const { items } = analyzeCsv(csv, new Set(), { year: 2026 });
  assert.equal(items[0].rec.year, 2026);
  assert.equal(items[0].rec.date, '2026-01-01');
});

test('analyzeRows: Duplikate innerhalb der Datei und gegen Bestand', () => {
  const csv = [
    'Datum;Auftraggeber;Betrag',
    '12.03.2024;Whitebox;32,00',
    '12.03.2024;Whitebox;32,00', // Duplikat zur Zeile davor
    '13.03.2024;Whitebox;10,00', // Duplikat zum Bestand
  ].join('\n');
  const existing = new Set([dedupeKey({ date: '2024-03-13', clientName: 'whitebox', fee: 10 })]);
  const { counts } = analyzeCsv(csv, existing);
  assert.equal(counts.valid, 1);
  assert.equal(counts.duplicate, 2);
});

// ---- rowToRecord: km verrechenbar optional ----

test('rowToRecord: km wird gerundet, fehlendes km → 0', () => {
  const r = rowToRecord(['12.03.2024', '40,4'], { date: 0, km: 1 });
  assert.equal(r.rec.km, 40);
  const r2 = rowToRecord(['12.03.2024', ''], { date: 0, km: 1 });
  assert.equal(r2.rec.km, 0);
});
