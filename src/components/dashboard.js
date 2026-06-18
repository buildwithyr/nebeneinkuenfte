/**
 * Dashboard Komponente
 * Übersicht: Einnahmen, Steuer-Schätzung, Auftraggeber-Verteilung, Monatschart
 */

import { store } from '../services/store.js';
import {
  yearStats, monthlyStats, clientStats, availableYears, filterByYear,
  freibetragStatus,
  formatCurrency, formatKm, formatPercent, formatDate, escapeHtml,
  FREIGRENZE, EINSCHLEIF_ENDE,
} from '../services/calculations.js';

let chartBar = null;
let selectedYear = new Date().getFullYear();

export function renderDashboard(container) {
  selectedYear = selectedYear || new Date().getFullYear();
  _render(container);

  // Re-render bei Datenänderungen
  const unsub1 = store.on('assignments', () => _render(container));
  const unsub2 = store.on('settings',    () => _render(container));
  container._dashboardUnsub = () => { unsub1(); unsub2(); };
}

export function destroyDashboard(container) {
  container._dashboardUnsub?.();
  if (chartBar) { chartBar.destroy(); chartBar = null; }
}

function _render(container) {
  const { assignments, clients, settings } = store;
  const years = availableYears(assignments);
  if (!years.includes(selectedYear)) selectedYear = years[0] ?? new Date().getFullYear();

  const stats   = yearStats(assignments, selectedYear, settings);
  const monthly = monthlyStats(assignments, selectedYear);
  const clientS = clientStats(assignments, clients, selectedYear, settings);
  const sym = settings.currencySymbol ?? '€';
  const yearAssignments = filterByYear(assignments, selectedYear);
  const openCount       = yearAssignments.filter(a => a.status === 'open').length;
  const completedCount  = yearAssignments.filter(a => a.status === 'completed').length;
  const openFee         = yearAssignments.filter(a => a.status === 'open').reduce((s, a) => s + (a.fee ?? 0), 0);

  container.innerHTML = `
    <div class="page-title">Dashboard</div>
    <p class="page-subtitle">Übersicht deiner Nebeneinkünfte</p>

    <!-- Jahr-Auswahl -->
    <div class="filter-bar mb-4" id="db-year-filter">
      ${years.map(y => `
        <button class="filter-chip ${y === selectedYear ? 'active' : ''}" data-year="${y}">
          ${y}
        </button>
      `).join('')}
    </div>

    <!-- Kennzahlen-Karten -->
    <div class="metrics-grid">
      <div class="metric-card accent-border">
        <div class="metric-icon accent-bg">💰</div>
        <div class="metric-label">Einnahmen ${selectedYear}</div>
        <div class="metric-value accent">${_fmt(stats.totalFee, sym)}</div>
        <div class="metric-sub">${stats.count} Aufträge</div>
      </div>

      <div class="metric-card">
        <div class="metric-icon accent-bg">📅</div>
        <div class="metric-label">Dieser Monat</div>
        <div class="metric-value">${_fmt(_thisMonthFee(assignments, settings), sym)}</div>
        <div class="metric-sub">${_thisMonthCount(assignments)} Aufträge</div>
      </div>

      <div class="metric-card ${stats.unpaidFee > 0 ? 'warning-border' : ''}">
        <div class="metric-icon ${stats.unpaidFee > 0 ? 'warning-bg' : 'accent-bg'}">⏳</div>
        <div class="metric-label">Offene Zahlungen</div>
        <div class="metric-value ${stats.unpaidFee > 0 ? 'warning' : ''}">${_fmt(stats.unpaidFee, sym)}</div>
        <div class="metric-sub">${completedCount} erledigt, unbezahlt</div>
      </div>

      <div class="metric-card ${openCount > 0 ? 'warning-border' : ''}">
        <div class="metric-icon warning-bg">📋</div>
        <div class="metric-label">Offene Aufträge</div>
        <div class="metric-value ${openCount > 0 ? 'warning' : ''}">${openCount}</div>
        <div class="metric-sub">${_fmt(openFee, sym)}</div>
      </div>

      <div class="metric-card ${completedCount > 0 ? 'accent-border' : ''}">
        <div class="metric-icon accent-bg">🔵</div>
        <div class="metric-label">Erledigt, bez. offen</div>
        <div class="metric-value ${completedCount > 0 ? 'accent' : ''}">${completedCount}</div>
        <div class="metric-sub">${_fmt(stats.unpaidFee, sym)}</div>
      </div>

      <div class="metric-card">
        <div class="metric-icon accent-bg">🚗</div>
        <div class="metric-label">Verrechenb. km</div>
        <div class="metric-value">${stats.billableKm.toLocaleString('de-AT')}</div>
        <div class="metric-sub">≈ ${_fmt(stats.totalKmMoney, sym)} Abzug</div>
      </div>

      <div class="metric-card danger-border">
        <div class="metric-icon danger-bg">🧾</div>
        <div class="metric-label">Geschätzte Steuer*</div>
        <div class="metric-value danger">${_fmt(stats.tax.taxAmount, sym)}</div>
        <div class="metric-sub">${formatPercent(stats.tax.effectiveRate)} eff. Rate</div>
      </div>

      ${_renderFreigrenzeCard(freibetragStatus(assignments, selectedYear, settings), sym)}

      <div class="metric-card warning-border">
        <div class="metric-icon warning-bg">🏦</div>
        <div class="metric-label">Empf. Rücklage*</div>
        <div class="metric-value warning">${_fmt(stats.reserve, sym)}</div>
        <div class="metric-sub">${formatPercent(settings.reserveRate ?? 0.40)} von Honorar</div>
      </div>
    </div>

    <div class="info-box warning-box mb-4">
      <span>⚠️</span>
      <span>* Schätzungen / Richtwerte, keine Steuerberatung. Inkl. § 41 Abs. 3 EStG Freigrenze (${FREIGRENZE} €) und Einschleifregelung (bis ${EINSCHLEIF_ENDE} €). Grenzsteuersatz: ${formatPercent(stats.tax.marginalRate)}.</span>
    </div>

    <!-- Monatschart -->
    <div class="card mb-4">
      <div class="section-header">
        <span class="section-title">Monatsverlauf ${selectedYear}</span>
      </div>
      <div class="chart-container">
        <canvas id="db-chart-bar"></canvas>
      </div>
    </div>

    <!-- Auftraggeber-Verteilung -->
    ${clientS.filter(c => c.count > 0).length > 0 ? `
    <div class="card mb-4">
      <div class="section-title mb-3">Auftraggeber ${selectedYear}</div>
      ${clientS.filter(c => c.count > 0).map(cs => `
        <div class="stat-row">
          <div>
            <div class="stat-row-label" style="font-weight:600;color:var(--text-primary)">${_esc(cs.client.name)}</div>
            <div class="stat-row-label">${cs.count} Aufträge · Ø ${_fmt(cs.avg, sym)}</div>
          </div>
          <div class="text-right">
            <div class="stat-row-value accent">${_fmt(cs.fee, sym)}</div>
            <div class="stat-row-label">${formatPercent(cs.share)}</div>
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${(cs.share*100).toFixed(1)}%"></div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Letzte Aufträge -->
    <div class="section-header">
      <span class="section-title">Letzte Aufträge</span>
    </div>
    <div class="list" id="db-recent">
      ${_recentAssignments(assignments, clients, sym)}
    </div>
  `;

  // Event: Jahr-Filter
  container.querySelector('#db-year-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-year]');
    if (!btn) return;
    selectedYear = Number(btn.dataset.year);
    _render(container);
  });

  // Chart zeichnen
  requestAnimationFrame(() => _drawChart(monthly, sym));
}

function _drawChart(monthly, sym) {
  const canvas = document.getElementById('db-chart-bar');
  if (!canvas) return;

  if (chartBar) { chartBar.destroy(); chartBar = null; }

  const isDark = document.documentElement.dataset.theme !== 'light';
  const textColor  = isDark ? '#8FA7BF' : '#4A6080';
  const gridColor  = isDark ? '#1E3048' : '#E2ECF4';
  const accentColor = '#00B4D8';

  chartBar = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: monthly.map(m => m.label),
      datasets: [{
        label: 'Honorar',
        data: monthly.map(m => m.fee),
        backgroundColor: monthly.map(m =>
          m.fee > 0 ? accentColor + 'CC' : gridColor
        ),
        borderColor: monthly.map(m => m.fee > 0 ? accentColor : 'transparent'),
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${sym} ${ctx.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { size: 11 } },
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { size: 11 },
            callback: (v) => `${sym} ${v}`,
          },
          beginAtZero: true,
        },
      },
    },
  });
}

function _recentAssignments(assignments, clients, sym) {
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]));
  const recent = [...assignments]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  if (!recent.length) {
    return `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-title">Noch keine Aufträge</div>
      <div class="empty-text">Tippe auf + um deinen ersten Auftrag einzutragen.</div>
    </div>`;
  }

  return recent.map(a => `
    <div class="list-item" data-id="${a.id}" onclick="window.app.navigate('assignments')">
      <div class="list-item-main">
        <div class="list-item-title">${_esc(a.description || clientMap[a.clientId] || '–')}</div>
        <div class="list-item-meta">
          <span>${_esc(clientMap[a.clientId] ?? '–')}</span>
          <span>·</span>
          <span>${formatDate(a.date)}</span>
          ${a.km > 0 ? `<span>· ${a.km} km</span>` : ''}
        </div>
      </div>
      <div>
        <div class="list-item-value ${a.status === 'paid' ? '' : 'warning'}">${_fmt(a.fee, sym)}</div>
        <div class="text-right mt-1">
          ${a.status === 'paid'
            ? '<span class="badge badge-success">💰 Bezahlt</span>'
            : a.status === 'completed'
              ? '<span class="badge badge-info">✓ Abgeschlossen</span>'
              : '<span class="badge badge-warning">📋 Offen</span>'}
        </div>
      </div>
    </div>
  `).join('');
}

function _thisMonthFee(assignments, settings) {
  const now = new Date();
  return assignments
    .filter(a => {
      const d = new Date(a.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((s, a) => s + (a.fee ?? 0), 0);
}

function _thisMonthCount(assignments) {
  const now = new Date();
  return assignments.filter(a => {
    const d = new Date(a.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
}

function _renderFreigrenzeCard(fb, sym) {
  const { limit, earned, remaining, exceeded, pct, taxableNet, taxFree, inEinschleif } = fb;

  // Anzeige (großer Wert + "offen") = Brutto-Honorar.
  // Farbe/Warnung = steuerpflichtiges Netto (konsistent mit der Steuer-Karte).
  let statusText, barColor, valueClass, iconBg, cardClass;
  if (taxFree) {
    statusText = earned <= limit
      ? `${_fmt(earned, sym)} von ${limit} € · noch ${_fmt(remaining, sym)} frei`
      : `${_fmt(earned, sym)} · nach km-Abzug unter ${limit} € → steuerfrei`;
    barColor   = 'var(--success)';
    valueClass = 'success';
    iconBg     = 'accent-bg';
    cardClass  = '';
  } else if (inEinschleif) {
    // Netto 730–1.460 €: Einschleifregelung
    statusText = `Steuerpfl. ${_fmt(taxableNet, sym)} · Überschreitung ${_fmt(exceeded, sym)} · Einschleifregelung`;
    barColor   = 'var(--warning)';
    valueClass = 'warning';
    iconBg     = 'warning-bg';
    cardClass  = 'warning-border';
  } else {
    // Netto über 1.460 €: voller Grenzsteuersatz
    statusText = `Steuerpfl. ${_fmt(taxableNet, sym)} · Überschreitung ${_fmt(exceeded, sym)} · voller Grenzsteuersatz`;
    barColor   = 'var(--danger)';
    valueClass = 'danger';
    iconBg     = 'danger-bg';
    cardClass  = 'danger-border';
  }

  return `
    <div class="metric-card ${cardClass}">
      <div class="metric-icon ${iconBg}">🎯</div>
      <div class="metric-label">Freigrenze ${FREIGRENZE} €*</div>
      <div class="metric-value ${valueClass}">${_fmt(earned, sym)}</div>
      <div class="metric-sub">${statusText}</div>
      <div style="margin-top:6px;height:4px;border-radius:2px;background:var(--border);overflow:hidden">
        <div style="height:100%;width:${pct.toFixed(0)}%;background:${barColor};border-radius:2px;transition:width 0.4s"></div>
      </div>
    </div>`;
}

const _fmt = formatCurrency;
const _esc = escapeHtml;
