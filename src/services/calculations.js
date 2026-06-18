/**
 * Business Logic – Steuer, Kilometer, Auswertungen
 *
 * WICHTIG: Alle Steuerberechnungen sind Schätzungen / Richtwerte.
 * Keine Steuerberatung. Alle Parameter sind im Einstellungsbereich anpassbar.
 */

// Österreichische Einkommensteuer-Tarifstufen nach Jahr (§ 33 EStG).
// `rate` gilt für Einkommen bis einschließlich `until` (Obergrenze der Stufe).
//
// Wartung: Die Grenzen werden jährlich per Inflationsanpassung verschoben.
// Für ein neues Jahr einfach einen weiteren Eintrag (z.B. 2027: [...]) ergänzen –
// alte Jahre bleiben für korrekte Rückrechnungen erhalten.
const TAX_BRACKETS_BY_YEAR = {
  2026: [
    { until: 13539,    rate: 0.00 },
    { until: 21992,    rate: 0.20 },
    { until: 36458,    rate: 0.30 },
    { until: 70365,    rate: 0.40 },
    { until: 104859,   rate: 0.48 },
    { until: 1000000,  rate: 0.50 },
    { until: Infinity, rate: 0.55 },
  ],
};

export const DEFAULT_TAX_YEAR = 2026;

/**
 * Tarifstufen für ein Jahr.
 * Fallback: jüngstes hinterlegtes Jahr ≤ `year` (sonst das neueste überhaupt) –
 * so rechnet die App auch für künftige Jahre weiter, bis neue Werte gepflegt sind.
 */
export function taxBracketsForYear(year) {
  if (TAX_BRACKETS_BY_YEAR[year]) return TAX_BRACKETS_BY_YEAR[year];
  const years = Object.keys(TAX_BRACKETS_BY_YEAR).map(Number).sort((a, b) => a - b);
  const fallback = years.filter(y => y <= year).pop() ?? years[years.length - 1];
  return TAX_BRACKETS_BY_YEAR[fallback] ?? TAX_BRACKETS_BY_YEAR[DEFAULT_TAX_YEAR];
}

/**
 * Österreichische Einkommensteuer auf ein Jahreseinkommen (brutto, nach Sonderausgaben)
 */
export function calcAustrianTax(grossIncome, year = DEFAULT_TAX_YEAR) {
  const brackets = taxBracketsForYear(year);
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    if (grossIncome <= lower) break;
    const taxable = Math.min(grossIncome, b.until) - lower;
    tax += taxable * b.rate;
    lower = b.until;
  }
  return Math.max(0, tax);
}

/**
 * Grenzsteuersatz für ein gegebenes Bruttogehalt.
 * An einer Stufengrenze (genau `until`) gilt noch der niedrigere Satz.
 */
export function marginalTaxRate(grossIncome, year = DEFAULT_TAX_YEAR) {
  const brackets = taxBracketsForYear(year);
  for (const b of brackets) {
    if (grossIncome <= b.until) return b.rate;
  }
  return brackets[brackets.length - 1].rate;
}

/**
 * Schätzung der Steuer für Nebeneinkünfte
 *
 * Methode: Gesamteinkünfte = Hauptberuf + Nebeneinkünfte
 * Geschätzte Steuer = Steuer(gesamt) - Steuer(Hauptberuf)
 *
 * § 41 Abs. 3 EStG – Freigrenze und Einschleifregelung:
 * - Bis 730 €: keine Steuer (Freigrenze)
 * - 730 € – 1.460 €: Einschleifregelung → volle_steuer × (gewinn − 730) / 730
 * - Ab 1.460 €: voller Progressionsbetrag
 *
 * HINWEIS: Vereinfacht – ohne Sonderausgaben, Werbungskosten, SV-Beiträge
 */
export const FREIGRENZE = 730;
export const EINSCHLEIF_ENDE = 1460; // 2 × Freigrenze

export function estimateSideIncomeTax(settings, sideIncomeNet, year = DEFAULT_TAX_YEAR) {
  if (sideIncomeNet <= 0) return { taxAmount: 0, effectiveRate: 0, marginalRate: 0, freigrenzeFree: FREIGRENZE, freigrenzePct: 0 };

  const freigrenzeFree = Math.max(0, FREIGRENZE - sideIncomeNet);
  const freigrenzePct  = Math.min(1, sideIncomeNet / FREIGRENZE);

  if (!settings.useAutomaticTaxRate) {
    const rate = settings.manualTaxRate ?? 0.40;
    // Einschleifregelung auch bei manuellem Satz anwenden
    const fullTax = sideIncomeNet * rate;
    const taxAmount = _applyEinschleif(fullTax, sideIncomeNet);
    return {
      taxAmount,
      effectiveRate: taxAmount / sideIncomeNet,
      marginalRate: rate,
      freigrenzeFree,
      freigrenzePct,
    };
  }

  const primaryGross  = settings.primaryIncomeGross ?? 46000;
  const taxOnPrimary  = calcAustrianTax(primaryGross, year);
  const taxOnTotal    = calcAustrianTax(primaryGross + sideIncomeNet, year);
  const fullTax       = Math.max(0, taxOnTotal - taxOnPrimary);
  const taxAmount     = _applyEinschleif(fullTax, sideIncomeNet);
  const effectiveRate = taxAmount / sideIncomeNet;
  const mRate         = marginalTaxRate(primaryGross, year);

  return { taxAmount, effectiveRate, marginalRate: mRate, freigrenzeFree, freigrenzePct };
}

/** § 41 Abs. 3 EStG – Freigrenze + Einschleifregelung auf einen berechneten Steuerbetrag anwenden */
function _applyEinschleif(fullTax, sideIncomeNet) {
  if (sideIncomeNet <= FREIGRENZE)    return 0;
  if (sideIncomeNet <= EINSCHLEIF_ENDE) return fullTax * (sideIncomeNet - FREIGRENZE) / FREIGRENZE;
  return fullTax;
}

/**
 * Kilometergeld-Berechnung
 * Verrechenbare km × Satz = steuerlich absetzbare Betriebsausgabe
 */
export function calcKmMoney(km, kmRate) {
  return (km ?? 0) * (kmRate ?? 0.42);
}

/**
 * Steuerpflichtiges Nettoeinkommen aus Nebentätigkeit
 * = Honorar - Kilometergeld
 *
 * Beträge werden defensiv mit Number() in Zahlen gewandelt, falls ein Wert
 * (z.B. aus einem alten Datensatz) als Text vorliegt.
 */
export function calcTaxableIncome(assignments, settings) {
  let totalFee = 0;
  let totalKmMoney = 0;

  for (const a of assignments) {
    totalFee += Number(a.fee) || 0;
    if (a.kmBillable) {
      totalKmMoney += calcKmMoney(Number(a.km) || 0, settings.kmRate);
    }
  }

  const taxableNet = Math.max(0, totalFee - totalKmMoney);
  return { totalFee, totalKmMoney, taxableNet };
}

/** Aufträge, die als Einkommen realisiert sind (durchgeführt). */
export function isRealizedIncome(a) {
  return a.status === 'completed' || a.status === 'paid';
}

/**
 * Freibetrag-/Freigrenzen-Tracker fürs Dashboard (Hybrid-Darstellung).
 *
 * Anzeige ("bereits verdient" / "offen"): Brutto-Honorare aus abgeschlossenen +
 * bezahlten Aufträgen des Jahres – so wie der Nutzer seine Einnahmen kennt.
 * Offene (noch nicht durchgeführte) Aufträge zählen nicht.
 *
 * Warn-/Steuer-Logik (taxFree / inEinschleif / fullRate / exceeded): basiert auf
 * dem steuerpflichtigen NETTO (nach Kilometergeld-Abzug). § 41 Abs. 3 EStG
 * bezieht die 730-€-Grenze auf den Gewinn, und auch die Steuer-Schätzung nutzt
 * das Netto. Dadurch warnt die Karte nur dann vor Überschreitung, wenn
 * tatsächlich Steuer anfällt – konsistent mit der Steuer-Karte.
 */
export function freibetragStatus(assignments, year, settings) {
  const limit = FREIGRENZE;
  const relevant = filterByYear(assignments, year).filter(isRealizedIncome);

  // Anzeige: bereits verdiente Brutto-Honorare
  const earned = relevant.reduce((s, a) => s + (Number(a.fee) || 0), 0);
  const remaining = Math.max(0, limit - earned);
  const pct = Math.min(100, limit > 0 ? (earned / limit) * 100 : 0);

  // Warnung/Steuer: steuerpflichtiges Netto (nach km-Abzug)
  const { taxableNet } = calcTaxableIncome(relevant, settings);
  const exceeded     = Math.max(0, taxableNet - limit);
  const taxFree      = taxableNet <= limit;
  const inEinschleif = taxableNet > limit && taxableNet <= EINSCHLEIF_ENDE;
  const fullRate     = taxableNet > EINSCHLEIF_ENDE;

  return {
    limit, earned, remaining, pct,
    taxableNet, exceeded, taxFree, inEinschleif, fullRate,
    count: relevant.length,
  };
}

// ---- Aggregationen ----

/** Alle Assignments eines Jahres */
export function filterByYear(assignments, year) {
  return assignments.filter(a => new Date(a.date).getFullYear() === year);
}

/** Alle Assignments eines Monats (1-12) */
export function filterByMonth(assignments, year, month) {
  return assignments.filter(a => {
    const d = new Date(a.date);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
}

/** Monats-Statistiken für ein Jahr (Array mit 12 Einträgen) */
export function monthlyStats(assignments, year) {
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: new Date(year, i, 1).toLocaleString('de-AT', { month: 'short' }),
    count: 0,
    fee: 0,
    km: 0,
    kmBillable: 0,
    unpaid: 0,
  }));

  for (const a of filterByYear(assignments, year)) {
    const m = new Date(a.date).getMonth(); // 0-indexed
    months[m].count++;
    months[m].fee += a.fee ?? 0;
    months[m].km  += a.km ?? 0;
    if (a.kmBillable) months[m].kmBillable += a.km ?? 0;
    if (a.status === 'completed') months[m].unpaid += a.fee ?? 0;
  }

  return months;
}

/** Jahres-Statistiken */
export function yearStats(assignments, year, settings) {
  const aYear = filterByYear(assignments, year);

  // Honorar-/Kilometer-Übersicht: alle Aufträge des Jahres
  const totalFee   = aYear.reduce((s, a) => s + (Number(a.fee) || 0), 0);
  const totalKm    = aYear.reduce((s, a) => s + (Number(a.km) || 0), 0);
  const billableKm = aYear.reduce((s, a) => s + (a.kmBillable ? (Number(a.km) || 0) : 0), 0);

  // Steuer-/Freigrenzen-Sicht: nur realisierte (abgeschlossene + bezahlte)
  // Einkünfte. Offene, noch nicht durchgeführte Aufträge sind kein Einkommen.
  const realized = aYear.filter(isRealizedIncome);
  const { totalKmMoney, taxableNet } = calcTaxableIncome(realized, settings);
  const tax = estimateSideIncomeTax(settings, taxableNet, year);

  const unpaidFee = aYear.filter(a => a.status === 'completed').reduce((s, a) => s + (Number(a.fee) || 0), 0);
  const reserve = taxableNet * (settings.reserveRate ?? 0.40);

  return {
    year,
    count: aYear.length,
    totalFee,
    totalKm,
    billableKm,
    totalKmMoney,
    taxableNet,
    tax,
    reserve,
    unpaidFee,
    netAfterTax: totalFee - tax.taxAmount,
  };
}

/** Auftraggeber-Statistiken */
export function clientStats(assignments, clients, year, settings) {
  const aYear = year ? filterByYear(assignments, year) : assignments;
  const totalFee = aYear.reduce((s, a) => s + (a.fee ?? 0), 0);

  return clients.map(client => {
    const clientAssignments = aYear.filter(a => a.clientId === client.id);
    const fee = clientAssignments.reduce((s, a) => s + (a.fee ?? 0), 0);
    const km  = clientAssignments.reduce((s, a) => s + (a.km ?? 0), 0);
    return {
      client,
      count: clientAssignments.length,
      fee,
      km,
      avg: clientAssignments.length > 0 ? fee / clientAssignments.length : 0,
      share: totalFee > 0 ? fee / totalFee : 0,
    };
  }).sort((a, b) => b.fee - a.fee);
}

/** Alle verfügbaren Jahre aus den Assignments */
export function availableYears(assignments) {
  const years = new Set(assignments.map(a => new Date(a.date).getFullYear()));
  const sorted = [...years].sort((a, b) => b - a);
  if (!sorted.includes(new Date().getFullYear())) {
    sorted.unshift(new Date().getFullYear());
  }
  return sorted;
}

// Formatierungshelfer
export function formatCurrency(amount, symbol = '€') {
  return `${symbol} ${(amount ?? 0).toLocaleString('de-AT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatKm(km) {
  return `${(km ?? 0).toLocaleString('de-AT')} km`;
}

export function formatPercent(rate) {
  return `${(rate * 100).toFixed(1)} %`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '–';
  return new Date(dateStr).toLocaleDateString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '–';
  return new Date(dateStr).toLocaleDateString('de-AT', {
    day: '2-digit', month: '2-digit',
  });
}

/** HTML-Escaping für Nutzereingaben (Auftraggeber-Namen, Notizen, Beschreibungen) */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
