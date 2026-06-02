/**
 * Business Logic – Steuer, Kilometer, Auswertungen
 *
 * WICHTIG: Alle Steuerberechnungen sind Schätzungen / Richtwerte.
 * Keine Steuerberatung. Alle Parameter sind im Einstellungsbereich anpassbar.
 */

// Österreichische Einkommensteuer-Tarifstufen 2024/2025
// Quelle: § 33 EStG, Werte nach Ökosoziale Steuerreform
const AT_TAX_BRACKETS = [
  { from: 0,        to: 12816,   rate: 0.00 },
  { from: 12816,    to: 20818,   rate: 0.20 },
  { from: 20818,    to: 34513,   rate: 0.30 },
  { from: 34513,    to: 66612,   rate: 0.40 },
  { from: 66612,    to: 99266,   rate: 0.48 },
  { from: 99266,    to: 1000000, rate: 0.50 },
  { from: 1000000,  to: Infinity,rate: 0.55 },
];

/**
 * Österreichische Einkommensteuer auf ein Jahreseinkommen (brutto, nach Sonderausgaben)
 */
export function calcAustrianTax(grossIncome) {
  let tax = 0;
  for (const bracket of AT_TAX_BRACKETS) {
    if (grossIncome <= bracket.from) break;
    const taxable = Math.min(grossIncome, bracket.to) - bracket.from;
    tax += taxable * bracket.rate;
  }
  return Math.max(0, tax);
}

/**
 * Grenzsteuersatz für ein gegebenes Bruttogehalt
 */
export function marginalTaxRate(grossIncome) {
  for (const bracket of AT_TAX_BRACKETS) {
    if (grossIncome < bracket.to) return bracket.rate;
  }
  return 0.55;
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

export function estimateSideIncomeTax(settings, sideIncomeNet) {
  if (sideIncomeNet <= 0) return { taxAmount: 0, effectiveRate: 0, marginalRate: 0, freigrenzeFree: FREIGRENZE, freigreuzePct: 0 };

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
  const taxOnPrimary  = calcAustrianTax(primaryGross);
  const taxOnTotal    = calcAustrianTax(primaryGross + sideIncomeNet);
  const fullTax       = Math.max(0, taxOnTotal - taxOnPrimary);
  const taxAmount     = _applyEinschleif(fullTax, sideIncomeNet);
  const effectiveRate = taxAmount / sideIncomeNet;
  const mRate         = marginalTaxRate(primaryGross);

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
 */
export function calcTaxableIncome(assignments, settings) {
  let totalFee = 0;
  let totalKmMoney = 0;

  for (const a of assignments) {
    totalFee += a.fee ?? 0;
    if (a.kmBillable) {
      totalKmMoney += calcKmMoney(a.km, settings.kmRate);
    }
  }

  const taxableNet = Math.max(0, totalFee - totalKmMoney);
  return { totalFee, totalKmMoney, taxableNet };
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
  const { totalFee, totalKmMoney, taxableNet } = calcTaxableIncome(aYear, settings);
  const tax = estimateSideIncomeTax(settings, taxableNet);
  const totalKm = aYear.reduce((s, a) => s + (a.km ?? 0), 0);
  const billableKm = aYear.reduce((s, a) => s + (a.kmBillable ? (a.km ?? 0) : 0), 0);
  const unpaidFee = aYear.filter(a => a.status === 'completed').reduce((s, a) => s + (a.fee ?? 0), 0);
  const reserve = totalFee * (settings.reserveRate ?? 0.40);

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
