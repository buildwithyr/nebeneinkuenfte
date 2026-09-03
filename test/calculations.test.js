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
  FREIGRENZE,
  EINSCHLEIF_ENDE,
} from '../src/services/calculations.js';

/** Gleitkomma-Vergleich mit Toleranz */
function close(actual, expected, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps, `erwartet ≈ ${expected}, war ${actual}`);
}

// ---- calcAustrianTax ----

test('calcAustrianTax: 0 € → keine Steuer', () => {
  assert.equal(calcAustrianTax(0), 0);
});

test('calcAustrianTax: bis zur Freibetragsgrenze 12.816 € steuerfrei', () => {
  assert.equal(calcAustrianTax(12816), 0);
});

test('calcAustrianTax: an Stufengrenze 20.818 €', () => {
  // 20% auf (20818 - 12816) = 8002
  close(calcAustrianTax(20818), 8002 * 0.2);
});

test('calcAustrianTax: an Stufengrenze 34.513 €', () => {
  // 20% auf 8002 + 30% auf (34513 - 20818)
  close(calcAustrianTax(34513), 8002 * 0.2 + 13695 * 0.3);
});

test('calcAustrianTax: Progression bei 46.000 €', () => {
  const expected = 8002 * 0.2 + 13695 * 0.3 + (46000 - 34513) * 0.4;
  close(calcAustrianTax(46000), expected);
});

test('calcAustrianTax: nie negativ', () => {
  assert.ok(calcAustrianTax(-1000) >= 0);
});

// ---- marginalTaxRate ----

test('marginalTaxRate: pro Tarifstufe', () => {
  assert.equal(marginalTaxRate(0), 0.0);
  assert.equal(marginalTaxRate(15000), 0.2);
  assert.equal(marginalTaxRate(25000), 0.3);
  assert.equal(marginalTaxRate(46000), 0.4);
  assert.equal(marginalTaxRate(80000), 0.48);
  assert.equal(marginalTaxRate(500000), 0.5);
  assert.equal(marginalTaxRate(2000000), 0.55);
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
  const fullTax = net * 0.4;
  const expected = (fullTax * (net - FREIGRENZE)) / FREIGRENZE;
  close(r.taxAmount, expected);
});

test('estimateSideIncomeTax: ab 1.460 € voller Progressionsbetrag', () => {
  const net = 2000;
  const r = estimateSideIncomeTax(AUTO, net);
  const expected = calcAustrianTax(46000 + net) - calcAustrianTax(46000);
  close(r.taxAmount, expected);
  close(r.taxAmount, 2000 * 0.4); // beide im 40%-Band
  close(r.effectiveRate, 0.4);
  assert.equal(r.marginalRate, 0.4);
});

test('estimateSideIncomeTax: Einschleifgrenze EINSCHLEIF_ENDE ist 2× Freigrenze', () => {
  assert.equal(EINSCHLEIF_ENDE, 2 * FREIGRENZE);
});

test('estimateSideIncomeTax: manueller Steuersatz mit Einschleifregelung', () => {
  const manual = { useAutomaticTaxRate: false, manualTaxRate: 0.4 };
  // > 1460 → voll
  close(estimateSideIncomeTax(manual, 2000).taxAmount, 2000 * 0.4);
  // in der Rampe
  const net = 1095;
  close(
    estimateSideIncomeTax(manual, net).taxAmount,
    (net * 0.4 * (net - FREIGRENZE)) / FREIGRENZE
  );
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
    { fee: 500, km: 50, kmBillable: false },
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
