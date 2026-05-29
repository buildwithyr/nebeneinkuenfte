/**
 * Auswertungen & Berichte
 * Jahres-, Monats-, Auftraggeber-Statistiken + Offene Zahlungen
 */

import { store } from '../services/store.js';
import {
  yearStats, monthlyStats, clientStats, availableYears,
  formatCurrency, formatKm, formatPercent, formatDate, filterByYear,
} from '../services/calculations.js';

let activeTab = 'year';
let selectedYear = new Date().getFullYear();
let chartPie = null;
let _markPaidHandler = null;

export function renderAnalytics(container) {
  registerMarkPaidListener();
  _render(container);
  const u1 = store.on('assignments', () => _render(container));
  const u2 = store.on('settings',    () => _render(container));
  container._analyticsUnsub = () => { u1(); u2(); };
}

export function destroyAnalytics(container) {
  container._analyticsUnsub?.();
  if (chartPie) { chartPie.destroy(); chartPie = null; }
  if (_markPaidHandler) {
    document.removeEventListener('click', _markPaidHandler);
    _markPaidHandler = null;
  }
}

function _render(container) {
  const { assignments, clients, settings } = store;
  const sym = settings.currencySymbol ?? '€';
  const years = availableYears(assignments);
  if (!years.includes(selectedYear)) selectedYear = years[0] ?? new Date().getFullYear();

  container.innerHTML = `
    <div class="page-title">Auswertungen</div>
    <div class="page-subtitle">Berichte & Statistiken</div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab-btn ${activeTab==='year' ? 'active' : ''}" data-tab="year">Jahres</button>
      <button class="tab-btn ${activeTab==='month' ? 'active' : ''}" data-tab="month">Monate</button>
      <button class="tab-btn ${activeTab==='client' ? 'active' : ''}" data-tab="client">Auftraggeber</button>
      <button class="tab-btn ${activeTab==='unpaid' ? 'active' : ''}" data-tab="unpaid">Offen</button>
    </div>

    <!-- Jahr-Auswahl -->
    <div class="filter-bar mb-4">
      ${years.map(y => `<button class="filter-chip ${y === selectedYear ? 'active' : ''}" data-year="${y}">${y}</button>`).join('')}
    </div>

    <div id="analytics-content">
      ${_renderTab(activeTab, assignments, clients, settings, selectedYear, sym)}
    </div>
  `;

  // Tab-Navigation
  container.querySelector('.tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    _render(container);
  });

  // Jahr-Filter
  container.querySelector('.filter-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-year]');
    if (!btn) return;
    selectedYear = Number(btn.dataset.year);
    _render(container);
  });

  // Pie-Chart zeichnen (Auftraggeber-Tab)
  if (activeTab === 'client') {
    requestAnimationFrame(() => _drawPieChart(assignments, clients, selectedYear));
  }
}

function _renderTab(tab, assignments, clients, settings, year, sym) {
  switch (tab) {
    case 'year':   return _renderYear(assignments, clients, settings, year, sym);
    case 'month':  return _renderMonths(assignments, settings, year, sym);
    case 'client': return _renderClients(assignments, clients, settings, year, sym);
    case 'unpaid': return _renderUnpaid(assignments, clients, settings, sym);
    default:       return '';
  }
}

function _renderYear(assignments, clients, settings, year, sym) {
  const stats = yearStats(assignments, year, settings);

  return `
    <div class="card mb-4">
      <div class="section-title mb-3">Jahresübersicht ${year}</div>

      <div class="stat-row">
        <span class="stat-row-label">Gesamte Einnahmen</span>
        <span class="stat-row-value accent">${_fmt(stats.totalFee, sym)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">Anzahl Aufträge</span>
        <span class="stat-row-value">${stats.count}</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">Durchschnitt / Auftrag</span>
        <span class="stat-row-value">${stats.count > 0 ? _fmt(stats.totalFee / stats.count, sym) : '–'}</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">Gesamte Kilometer</span>
        <span class="stat-row-value">${stats.totalKm.toLocaleString('de-AT')} km</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">Verrechenbare km</span>
        <span class="stat-row-value">${stats.billableKm.toLocaleString('de-AT')} km</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">Kilometergeld-Abzug</span>
        <span class="stat-row-value success">${_fmt(stats.totalKmMoney, sym)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">Steuerpflichtiges Nettoeinkommen</span>
        <span class="stat-row-value">${_fmt(stats.taxableNet, sym)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">Offene Zahlungen</span>
        <span class="stat-row-value ${stats.unpaidFee > 0 ? 'warning' : ''}">${_fmt(stats.unpaidFee, sym)}</span>
      </div>
    </div>

    <div class="card mb-3">
      <div class="section-title mb-3">Steuer-Schätzung* ${year}</div>
      <div class="stat-row">
        <span class="stat-row-label">Grenzsteuersatz</span>
        <span class="stat-row-value">${formatPercent(stats.tax.marginalRate)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">Effektive Rate auf Nebeneinkommen</span>
        <span class="stat-row-value">${formatPercent(stats.tax.effectiveRate)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">Geschätzte Steuerlast</span>
        <span class="stat-row-value danger">${_fmt(stats.tax.taxAmount, sym)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">Empfohlene Rücklage (${formatPercent(settings.reserveRate ?? 0.4)})</span>
        <span class="stat-row-value warning">${_fmt(stats.reserve, sym)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">Nettoeinkommen nach Steuer</span>
        <span class="stat-row-value success">${_fmt(stats.netAfterTax, sym)}</span>
      </div>
    </div>
    <div class="info-box warning-box">
      <span>⚠️</span>
      <span>* Alle Steuerberechnungen sind unverbindliche Schätzungen. Einstellbar unter Einstellungen → Steuer. Keine steuerliche Beratung.</span>
    </div>
  `;
}

function _renderMonths(assignments, settings, year, sym) {
  const monthly = monthlyStats(assignments, year);
  const total   = monthly.reduce((s, m) => s + m.fee, 0);

  return `
    <div class="card">
      <div class="section-title mb-3">Monatliche Einnahmen ${year}</div>
      ${monthly.map(m => `
        <div class="stat-row">
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span class="stat-row-label" style="font-weight:600;color:var(--text-primary)">${m.label}</span>
              <span class="stat-row-value ${m.fee > 0 ? 'accent' : 'muted'}">${m.fee > 0 ? _fmt(m.fee, sym) : '–'}</span>
            </div>
            ${m.count > 0 ? `
              <div class="progress-bar">
                <div class="progress-fill" style="width:${total > 0 ? (m.fee/total*100).toFixed(1) : 0}%"></div>
              </div>
              <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px">
                ${m.count} Aufträge · ${m.km > 0 ? m.km + ' km' : ''}
                ${m.unpaid > 0 ? `· <span style="color:var(--warning)">${_fmt(m.unpaid, sym)} offen</span>` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function _renderClients(assignments, clients, settings, year, sym) {
  const stats = clientStats(assignments, clients, year, settings);
  const active = stats.filter(s => s.count > 0);

  return `
    ${active.length > 0 ? `
      <div class="card mb-4">
        <div class="chart-container">
          <canvas id="analytics-pie"></canvas>
        </div>
      </div>
    ` : ''}
    <div class="card">
      <div class="section-title mb-3">Auftraggeber ${year}</div>
      ${stats.length === 0
        ? '<div class="empty-state"><div class="empty-icon">🏢</div><div class="empty-title">Keine Daten</div></div>'
        : stats.map(cs => `
        <div class="stat-row">
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;margin-bottom:2px">
              <span style="font-weight:600;font-size:0.875rem;color:var(--text-primary)">${_esc(cs.client.name)}</span>
              <span class="stat-row-value accent">${_fmt(cs.fee, sym)}</span>
            </div>
            <div style="display:flex;gap:8px;font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">
              <span>${cs.count} Aufträge</span>
              ${cs.count > 0 ? `<span>· Ø ${_fmt(cs.avg, sym)}</span>` : ''}
              ${cs.km > 0 ? `<span>· ${cs.km} km</span>` : ''}
            </div>
            ${cs.count > 0 ? `
              <div class="progress-bar">
                <div class="progress-fill" style="width:${(cs.share*100).toFixed(1)}%;background:${_clientColor(clients.indexOf(cs.client))}"></div>
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function _renderUnpaid(assignments, clients, settings, sym) {
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]));
  const unpaid = [...assignments]
    .filter(a => a.status !== 'paid')
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalUnpaid = unpaid.reduce((s, a) => s + (a.fee ?? 0), 0);

  if (!unpaid.length) {
    return `<div class="empty-state">
      <div class="empty-icon">✅</div>
      <div class="empty-title">Alles bezahlt!</div>
      <div class="empty-text">Keine offenen Zahlungen vorhanden.</div>
    </div>`;
  }

  return `
    <div class="info-box warning-box mb-4">
      <span>⏳</span>
      <span>${unpaid.length} offene Zahlungen · Gesamt: ${_fmt(totalUnpaid, sym)}</span>
    </div>
    <div class="list">
      ${unpaid.map(a => `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${_esc(a.description || clientMap[a.clientId] || '–')}</div>
            <div class="list-item-meta">
              <span>${_esc(clientMap[a.clientId] ?? '–')}</span>
              <span>·</span>
              <span>${formatDate(a.date)}</span>
              ${a.km > 0 ? `<span>· ${a.km} km</span>` : ''}
            </div>
            ${a.note ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">${_esc(a.note)}</div>` : ''}
          </div>
          <div>
            <div class="list-item-value warning">${_fmt(a.fee, sym)}</div>
            <button class="btn btn-success btn-sm mt-1" data-mark-paid="${a.id}">✓ Bezahlt</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function _drawPieChart(assignments, clients, year) {
  const canvas = document.getElementById('analytics-pie');
  if (!canvas) return;
  if (chartPie) { chartPie.destroy(); chartPie = null; }

  const stats = clientStats(assignments, clients, year, store.settings);
  const active = stats.filter(s => s.count > 0);
  if (!active.length) return;

  const colors = active.map((_, i) => _clientColor(i));

  chartPie = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: active.map(s => s.client.name),
      datasets: [{
        data: active.map(s => s.fee),
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: document.documentElement.dataset.theme === 'light' ? '#fff' : '#0D1B2A',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: document.documentElement.dataset.theme === 'light' ? '#4A6080' : '#8FA7BF',
            font: { size: 11 },
            padding: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const sym = store.settings.currencySymbol ?? '€';
              return ` ${sym} ${ctx.parsed.toFixed(2)} (${(active[ctx.dataIndex].share * 100).toFixed(1)}%)`;
            },
          },
        },
      },
    },
  });
}

const CHART_COLORS = ['#00B4D8','#06D6A0','#FFB703','#EF476F','#118AB2','#7B2FBE','#F4A261'];
function _clientColor(idx) { return CHART_COLORS[idx % CHART_COLORS.length]; }

function _fmt(v, sym) {
  return `${sym} ${(v ?? 0).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// "Bezahlt markieren" Event-Delegation – wird bei renderAnalytics registriert und bei destroyAnalytics entfernt
export function registerMarkPaidListener() {
  if (_markPaidHandler) document.removeEventListener('click', _markPaidHandler);
  _markPaidHandler = (e) => {
    const btn = e.target.closest('[data-mark-paid]');
    if (!btn) return;
    const id = btn.dataset.markPaid;
    store.updateAssignment(id, { status: 'paid', paidDate: new Date().toISOString().slice(0, 10) });
  };
  document.addEventListener('click', _markPaidHandler);
}
