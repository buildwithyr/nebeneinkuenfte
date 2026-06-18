/**
 * Tests für die Steuer- und Berechnungslogik (calculations.js).
 * Ausführen mit:  node --test   (kein Build, keine Dependencies nötig)
 *
 * Deckt die kritische, unverbindliche Steuerschätzung ab:
 * § 33 EStG Tarifstufen, Grenzsteuersatz, § 41 Abs. 3 Freigrenze + Einschleifregelung,
 * Kilometergeld und das steuerpflichtige Nettoeinkommen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  calcAustrianTax,
  marginalTaxRate,
  estimateSideIncomeTax,
  calcKmMoney,
  calcTaxableIncome,
  freibetragStatus,
  yearStats,
  FREIGRENZE,
  EINSCHLEIF_ENDE,
} from '../src/services/calculations.js';

/** Gleitkomma-Vergleich mit Toleranz */
function close(actual, expected, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps,
    `erwartet ≈ ${expected}, war ${actual}`);
}

// ---- calcAustrianTax ----

test('calcAustrianTax: 0 € → keine Steuer', () => {
  assert.equal(calcAustrianTax(0), 0);
});

test('calcAustrianTax: bis zur Freibetragsgrenze 13.539 € steuerfrei (2026)', () => {
  assert.equal(calcAustrianTax(13539), 0);
});

test('calcAustrianTax: an Stufengrenze 21.992 € (2026)', () => {
  // 20% auf (21992 - 13539) = 8453
  close(calcAustrianTax(21992), 8453 * 0.20);
});

test('calcAustrianTax: an Stufengrenze 36.458 € (2026)', () => {
  // 20% auf 8453 + 30% auf (36458 - 21992)
  close(calcAustrianTax(36458), 8453 * 0.20 + 14466 * 0.30);
});

test('calcAustrianTax: Progression bei 46.000 € (2026)', () => {
  const expected = 8453 * 0.20 + 14466 * 0.30 + (46000 - 36458) * 0.40;
  close(calcAustrianTax(46000), expected);
});

test('calcAustrianTax: nie negativ', () => {
  assert.ok(calcAustrianTax(-1000) >= 0);
});

// ---- marginalTaxRate ----

test('marginalTaxRate: Tarifstufen Österreich 2026', () => {
  assert.equal(marginalTaxRate(13539), 0.00);
  assert.equal(marginalTaxRate(13540), 0.20);

  assert.equal(marginalTaxRate(21992), 0.20);
  assert.equal(marginalTaxRate(21993), 0.30);

  assert.equal(marginalTaxRate(36458), 0.30);
  assert.equal(marginalTaxRate(36459), 0.40);

  assert.equal(marginalTaxRate(70365), 0.40);
  assert.equal(marginalTaxRate(70366), 0.48);

  assert.equal(marginalTaxRate(104859), 0.48);
  assert.equal(marginalTaxRate(104860), 0.50);

  assert.equal(marginalTaxRate(1000000), 0.50);
  assert.equal(marginalTaxRate(1000001), 0.55);
});

test('taxBracketsForYear: künftige Jahre nutzen das jüngste hinterlegte Jahr', () => {
  // Solange 2027 nicht gepflegt ist, gelten die 2026er-Stufen weiter.
  assert.equal(marginalTaxRate(46000, 2027), marginalTaxRate(46000, 2026));
  assert.equal(calcAustrianTax(46000, 2099), calcAustrianTax(46000, 2026));
});

// ---- estimateSideIncomeTax: Freigrenze & Einschleifregelung ----

const AUTO = { useAutomaticTaxRate: true, primaryIncomeGross: 46000 };

test('estimateSideIncomeTax: ≤ 0 → alles null, kein Tippfehler-Key', () => {
  const r = estimateSideIncomeTax(AUTO, 0);
  assert.equal(r.taxAmount, 0);
  assert.equal(r.effectiveRate, 0);
  // Regressionsschutz für den behobenen 'freigreuzePct'-Tippfehler:
  assert.ok('freigrenzePct' in r);
  assert.ok(!('freigreuzePct' in r));
});

test('estimateSideIncomeTax: innerhalb Freigrenze (730 €) → keine Steuer', () => {
  assert.equal(estimateSideIncomeTax(AUTO, 500).taxAmount, 0);
  assert.equal(estimateSideIncomeTax(AUTO, FREIGRENZE).taxAmount, 0);
});

test('estimateSideIncomeTax: Einschleifregelung bei 1.095 € (Mitte der Rampe)', () => {
  const net = 1095; // genau zwischen 730 und 1460
  const r = estimateSideIncomeTax(AUTO, net);
  // Grenzsteuersatz 40%, Rampe (net-730)/730 = 0.5 → 40% * net * 0.5
  const fullTax = net * 0.40;
  const expected = fullTax * (net - FREIGRENZE) / FREIGRENZE;
  close(r.taxAmount, expected);
});

test('estimateSideIncomeTax: ab 1.460 € voller Progressionsbetrag', () => {
  const net = 2000;
  const r = estimateSideIncomeTax(AUTO, net);
  const expected = calcAustrianTax(46000 + net) - calcAustrianTax(46000);
  close(r.taxAmount, expected);
  close(r.taxAmount, 2000 * 0.40); // beide im 40%-Band
  close(r.effectiveRate, 0.40);
  assert.equal(r.marginalRate, 0.40);
});

test('estimateSideIncomeTax: Einschleifgrenze EINSCHLEIF_ENDE ist 2× Freigrenze', () => {
  assert.equal(EINSCHLEIF_ENDE, 2 * FREIGRENZE);
});

test('estimateSideIncomeTax: manueller Steuersatz mit Einschleifregelung', () => {
  const manual = { useAutomaticTaxRate: false, manualTaxRate: 0.40 };
  // > 1460 → voll
  close(estimateSideIncomeTax(manual, 2000).taxAmount, 2000 * 0.40);
  // in der Rampe
  const net = 1095;
  close(estimateSideIncomeTax(manual, net).taxAmount,
    net * 0.40 * (net - FREIGRENZE) / FREIGRENZE);
  // unter Freigrenze
  assert.equal(estimateSideIncomeTax(manual, 500).taxAmount, 0);
});

// ---- calcKmMoney ----

test('calcKmMoney: km × Satz', () => {
  close(calcKmMoney(100, 0.42), 42);
});

test('calcKmMoney: Default-Satz 0,42 und Null-Eingaben', () => {
  close(calcKmMoney(100), 42);
  assert.equal(calcKmMoney(), 0);
  assert.equal(calcKmMoney(0, 0.42), 0);
});

// ---- calcTaxableIncome ----

test('calcTaxableIncome: nur verrechenbares Kilometergeld zieht ab', () => {
  const settings = { kmRate: 0.42 };
  const assignments = [
    { fee: 1000, km: 100, kmBillable: true },
    { fee: 500,  km: 50,  kmBillable: false },
  ];
  const r = calcTaxableIncome(assignments, settings);
  assert.equal(r.totalFee, 1500);
  close(r.totalKmMoney, 100 * 0.42); // nur der erste Auftrag
  close(r.taxableNet, 1500 - 42);
});

test('calcTaxableIncome: taxableNet nie negativ', () => {
  const settings = { kmRate: 0.42 };
  const assignments = [{ fee: 10, km: 100, kmBillable: true }]; // kmGeld 42 > Honorar 10
  assert.equal(calcTaxableIncome(assignments, settings).taxableNet, 0);
});

test('calcTaxableIncome: Honorar als Text wird wie Zahl behandelt (keine Konkatenation)', () => {
  const settings = { kmRate: 0.42 };
  const assignments = [{ fee: '32', km: '10', kmBillable: false }, { fee: '8', km: 0, kmBillable: false }];
  assert.equal(calcTaxableIncome(assignments, settings).totalFee, 40); // nicht "328"
});

// ---- freibetragStatus (Dashboard-Bug: 142 € verdient → 588 € offen) ----

const SETTINGS = { kmRate: 0.42, reserveRate: 0.40, useAutomaticTaxRate: true, primaryIncomeGross: 46000 };

// Reale Datenlage aus Supabase: 8 bezahlte Aufträge 2026, Summe 142 €,
// davon 305 verrechenbare km. Der km-Abzug darf den Freibetrag-Fortschritt NICHT mindern.
const REAL_2026 = [
  { fee: 32, km: 110, kmBillable: true,  status: 'paid', date: '2026-03-02' },
  { fee: 32, km: 90,  kmBillable: true,  status: 'paid', date: '2026-03-02' },
  { fee: 30, km: 40,  kmBillable: true,  status: 'paid', date: '2026-03-03' },
  { fee: 10, km: 50,  kmBillable: true,  status: 'paid', date: '2026-04-04' },
  { fee: 10, km: 15,  kmBillable: true,  status: 'paid', date: '2026-04-05' },
  { fee: 10, km: 0,   kmBillable: false, status: 'paid', date: '2026-05-29' },
  { fee: 10, km: 0,   kmBillable: false, status: 'paid', date: '2026-05-29' },
  { fee: 8,  km: 0,   kmBillable: false, status: 'paid', date: '2026-05-29' },
];

test('freibetragStatus: 142 € verdient → 588 € offen (Bugfix)', () => {
  const fb = freibetragStatus(REAL_2026, 2026, SETTINGS);
  assert.equal(fb.earned, 142);
  assert.equal(fb.remaining, 588);
  assert.equal(fb.exceeded, 0);
});

test('freibetragStatus: offene Aufträge zählen nicht als verdient', () => {
  const data = [
    { fee: 100, status: 'paid',      date: '2026-01-10' },
    { fee: 50,  status: 'completed', date: '2026-02-10' },
    { fee: 999, status: 'open',      date: '2026-03-10' }, // noch nicht durchgeführt
  ];
  const fb = freibetragStatus(data, 2026, SETTINGS);
  assert.equal(fb.earned, 150);
  assert.equal(fb.remaining, FREIGRENZE - 150);
});

test('freibetragStatus (Hybrid): hohe km → Anzeige bleibt Brutto, Warnung folgt Netto', () => {
  // 800 € brutto, 300 verrechenbare km → Netto 674 € < 730 → keine Steuer/Warnung
  const data = [{ fee: 800, km: 300, kmBillable: true, status: 'paid', date: '2026-01-10' }];
  const fb = freibetragStatus(data, 2026, SETTINGS);
  assert.equal(fb.earned, 800);            // Anzeige: Brutto-Honorar
  assert.equal(fb.remaining, 0);           // 730 - 800
  close(fb.taxableNet, 800 - 300 * 0.42);  // 674
  assert.equal(fb.exceeded, 0);            // Netto < 730 → keine Überschreitung
  assert.equal(fb.taxFree, true);          // keine Warnung (grün)
  assert.equal(fb.inEinschleif, false);
});

test('freibetragStatus: über 730 € → offen 0, Überschreitung separat', () => {
  const data = [{ fee: 900, status: 'paid', date: '2026-01-10' }];
  const fb = freibetragStatus(data, 2026, SETTINGS);
  assert.equal(fb.remaining, 0);
  assert.equal(fb.exceeded, 900 - FREIGRENZE);
  assert.ok(fb.inEinschleif); // 730–1460
});

test('freibetragStatus: nur das gewählte Jahr zählt', () => {
  const data = [
    { fee: 100, status: 'paid', date: '2026-01-10' },
    { fee: 500, status: 'paid', date: '2025-12-31' },
  ];
  assert.equal(freibetragStatus(data, 2026, SETTINGS).earned, 100);
  assert.equal(freibetragStatus(data, 2025, SETTINGS).earned, 500);
});

// ---- yearStats: Steuer nur auf realisierte Einkünfte ----

test('yearStats: offene Aufträge erhöhen die Steuerbasis nicht', () => {
  const data = [
    { fee: 600, km: 0, kmBillable: false, status: 'paid', date: '2026-01-10' },
    { fee: 800, km: 0, kmBillable: false, status: 'open', date: '2026-02-10' },
  ];
  const s = yearStats(data, 2026, SETTINGS);
  assert.equal(s.totalFee, 1400);   // Übersicht: alle Aufträge
  assert.equal(s.taxableNet, 600);  // Steuer: nur realisierte
});
