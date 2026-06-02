/**
 * Aufträge – Liste, Filter, Formular (Add/Edit)
 */

import { store } from '../services/store.js';
import { formatDate, formatCurrency, availableYears, filterByYear } from '../services/calculations.js';
import { showToast } from '../app.js';

let filterYear = new Date().getFullYear();
let filterClient = 'all';
let filterStatus = 'all';
let editingId = null;

// Long-Press state (module-level – überlebt Re-Renders)
let _lpTimer = null;
let _lpFired = false;
let _openModalFn = null;   // Referenz auf openModal aus _attachListeners
let _escListener = null;   // Für Kontextmenü-Escape-Handler

export function renderAssignments(container) {
  _render(container);
  const u1 = store.on('assignments', () => _render(container));
  const u2 = store.on('clients',     () => _render(container));
  container._assignmentsUnsub = () => { u1(); u2(); };
  _createContextMenu();
}

export function destroyAssignments(container) {
  container._assignmentsUnsub?.();
  clearTimeout(_lpTimer);
  _openModalFn = null;
  document.getElementById('ctx-backdrop')?.remove();
  document.getElementById('ctx-menu')?.remove();
  if (_escListener) { document.removeEventListener('keydown', _escListener); _escListener = null; }
}

function _render(container) {
  const { assignments, clients, settings } = store;
  const sym = settings.currencySymbol ?? '€';
  const years = availableYears(assignments);

  let filtered = [...assignments];
  if (filterYear !== 'all') filtered = filtered.filter(a => new Date(a.date).getFullYear() === Number(filterYear));
  if (filterClient !== 'all') filtered = filtered.filter(a => a.clientId === filterClient);
  if (filterStatus !== 'all') filtered = filtered.filter(a => a.status === filterStatus);
  filtered.sort((a, b) => b.date.localeCompare(a.date));

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]));
  const totalFee  = filtered.reduce((s, a) => s + (a.fee ?? 0), 0);

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div>
        <div class="page-title">Aufträge</div>
        <div class="page-subtitle">${filtered.length} Einträge · ${sym} ${totalFee.toLocaleString('de-AT', {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
      </div>
      <button class="btn btn-primary btn-sm" id="asgn-add-btn">+ Neu</button>
    </div>

    <!-- Filter: Jahr -->
    <div class="filter-bar" data-filter="year">
      <button class="filter-chip ${filterYear === 'all' ? 'active' : ''}" data-year="all">Alle</button>
      ${years.map(y => `<button class="filter-chip ${filterYear == y ? 'active' : ''}" data-year="${y}">${y}</button>`).join('')}
    </div>

    <!-- Filter: Auftraggeber -->
    <div class="filter-bar" data-filter="client">
      <button class="filter-chip ${filterClient === 'all' ? 'active' : ''}" data-client="all">Alle AG</button>
      ${clients.filter(c => c.active).map(c =>
        `<button class="filter-chip ${filterClient === c.id ? 'active' : ''}" data-client="${c.id}">${_esc(c.name)}</button>`
      ).join('')}
    </div>

    <!-- Filter: Status -->
    <div class="filter-bar mb-2" data-filter="status">
      <button class="filter-chip ${filterStatus === 'all'       ? 'active' : ''}" data-status="all">Alle</button>
      <button class="filter-chip ${filterStatus === 'open'      ? 'active' : ''}" data-status="open">📋 Offen</button>
      <button class="filter-chip ${filterStatus === 'completed' ? 'active' : ''}" data-status="completed">✓ Abgeschlossen</button>
      <button class="filter-chip ${filterStatus === 'paid'      ? 'active' : ''}" data-status="paid">💰 Bezahlt</button>
    </div>

    <!-- Liste -->
    <div class="list" id="asgn-list">
      ${filtered.length === 0
        ? `<div class="empty-state">
            <div class="empty-icon">📋</div>
            <div class="empty-title">Keine Aufträge</div>
            <div class="empty-text">Passe die Filter an oder lege einen neuen Auftrag an.</div>
           </div>`
        : filtered.map(a => _renderItem(a, clientMap, sym)).join('')
      }
    </div>

    <!-- Modal -->
    <div class="modal-backdrop" id="asgn-modal-backdrop">
      <div class="modal" id="asgn-modal">
        <div class="modal-handle"></div>
        <div class="modal-title" id="asgn-modal-title">Neuer Auftrag</div>
        <form id="asgn-form">
          ${_renderForm(clients)}
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="asgn-cancel">Abbrechen</button>
            <button type="submit" class="btn btn-primary" id="asgn-submit">Speichern</button>
          </div>
          <div id="asgn-delete-zone" class="hidden mt-3">
            <button type="button" class="btn btn-danger btn-full" id="asgn-delete">Auftrag löschen</button>
          </div>
        </form>
      </div>
    </div>
  `;

  _attachListeners(container, clients, sym);
}

function _statusBadge(status) {
  if (status === 'paid')      return '<span class="badge status-paid">🟢 Bezahlt</span>';
  if (status === 'completed') return '<span class="badge status-completed">🔵 Erledigt</span>';
  return '<span class="badge status-open">🟡 Offen</span>';
}

function _renderItem(a, clientMap, sym) {
  const kmBadge = a.kmBillable && a.km > 0
    ? `<span class="badge badge-accent">🚗 ${a.km} km</span>` : '';

  let actionBtn = '';
  if (a.status === 'open') {
    actionBtn = `<button class="btn btn-sm btn-secondary mt-2" data-action-status="completed" data-action-id="${a.id}">✓ Als erledigt markieren</button>`;
  } else if (a.status === 'completed') {
    actionBtn = `<button class="btn btn-sm btn-success mt-2" data-action-status="paid" data-action-id="${a.id}">💰 Als bezahlt markieren</button>`;
  }

  return `
    <div class="list-item" data-asgn-id="${a.id}">
      <div class="list-item-main">
        <div class="list-item-title">${_esc(a.description || clientMap[a.clientId] || '–')}</div>
        <div class="list-item-meta">
          <span>${_esc(clientMap[a.clientId] ?? '–')}</span>
          <span>·</span>
          <span>${formatDate(a.date)}</span>
        </div>
        <div class="flex gap-2 mt-1">
          ${_statusBadge(a.status)}
          ${kmBadge}
          ${a.note ? '<span class="badge badge-muted">📝</span>' : ''}
        </div>
        ${actionBtn}
      </div>
      <div class="list-item-value ${a.status === 'paid' ? 'success' : ''}">${sym} ${(a.fee ?? 0).toFixed(2)}</div>
    </div>
  `;
}

function _renderForm(clients) {
  const today = new Date().toISOString().slice(0, 10);
  const activeClients = clients.filter(c => c.active);

  return `
    <div class="form-group">
      <label class="form-label">Datum <span class="required">*</span></label>
      <input type="date" class="form-control" name="date" value="${today}" required>
    </div>
    <div class="form-group">
      <label class="form-label">Auftraggeber <span class="required">*</span></label>
      <select class="form-control" name="clientId" required>
        <option value="">– Bitte wählen –</option>
        ${activeClients.map(c => `<option value="${c.id}">${_esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Beschreibung</label>
      <input type="text" class="form-control" name="description" placeholder="z.B. IQOS Flagship Store Wien">
    </div>
    <div class="form-group">
      <label class="form-label">Honorar (€) <span class="required">*</span></label>
      <input type="number" class="form-control" name="fee" step="0.01" min="0" placeholder="0.00" required>
    </div>
    <div class="form-group">
      <label class="form-label">Kilometer</label>
      <input type="number" class="form-control" name="km" step="1" min="0" placeholder="0">
    </div>
    <div class="form-group">
      <div class="switch-row">
        <label class="switch-label">Kilometer verrechenbar</label>
        <label class="switch">
          <input type="checkbox" name="kmBillable">
          <span class="switch-track"></span>
        </label>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Status</label>
      <select class="form-control" name="status">
        <option value="open">📋 Offen – noch nicht durchgeführt</option>
        <option value="completed">✓ Abgeschlossen – warte auf Auszahlung</option>
        <option value="paid">💰 Bezahlt – Auszahlung erhalten</option>
      </select>
    </div>
    <div class="form-group" id="paid-date-group" style="display:none">
      <label class="form-label">Zahlungsdatum</label>
      <input type="date" class="form-control" name="paidDate">
    </div>
    <div class="form-group">
      <label class="form-label">Notiz</label>
      <textarea class="form-control" name="note" rows="2" placeholder="Interne Notiz…"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Typ</label>
      <select class="form-control" name="type">
        <option value="mystery_shopping">Mystery Shopping / Testkauf</option>
        <option value="online_discussion">Online-Diskussion / Panel</option>
        <option value="other">Sonstige Nebentätigkeit</option>
      </select>
    </div>
  `;
}

function _attachListeners(container, clients, sym) {
  const backdrop    = container.querySelector('#asgn-modal-backdrop');
  const modal       = container.querySelector('#asgn-modal');
  const form        = container.querySelector('#asgn-form');
  const title       = container.querySelector('#asgn-modal-title');
  const statusSel   = form.querySelector('[name="status"]');
  const paidDG      = form.querySelector('#paid-date-group');
  const deleteZone  = container.querySelector('#asgn-delete-zone');

  function openModal(assignmentId) {
    editingId = assignmentId ?? null;
    title.textContent = editingId ? 'Auftrag bearbeiten' : 'Neuer Auftrag';
    deleteZone?.classList.toggle('hidden', !editingId);

    if (editingId) {
      const a = store.getAssignment(editingId);
      if (a) _fillForm(form, a);
    } else {
      form.reset();
      form.querySelector('[name="date"]').value = new Date().toISOString().slice(0, 10);
      statusSel.value = 'open';
      paidDG.style.display = 'none';
    }

    backdrop.classList.add('visible');
    setTimeout(() => modal.classList.add('visible'), 10);
  }

  function closeModal() {
    modal.classList.remove('visible');
    setTimeout(() => backdrop.classList.remove('visible'), 300);
    editingId = null;
  }

  // Status-Auswahl → Zahlungsdatum zeigen/verstecken
  statusSel.addEventListener('change', () => {
    const isPaid = statusSel.value === 'paid';
    paidDG.style.display = isPaid ? '' : 'none';
    if (isPaid && !form.querySelector('[name="paidDate"]').value) {
      form.querySelector('[name="paidDate"]').value = new Date().toISOString().slice(0, 10);
    }
  });

  // Referenz auf openModal für Kontextmenü-Aktionen speichern
  _openModalFn = openModal;

  const list = container.querySelector('#asgn-list');

  // ---- Long-Press Erkennung (Touch) ----
  list?.addEventListener('touchstart', (e) => {
    const item = e.target.closest('[data-asgn-id]');
    if (!item || e.target.closest('[data-action-status]')) return;
    _lpFired = false;
    _lpTimer = setTimeout(() => {
      _lpFired = true;
      navigator.vibrate?.(8);
      _showContextMenu(item);
    }, 500);
  }, { passive: true });

  list?.addEventListener('touchmove',   () => clearTimeout(_lpTimer), { passive: true });
  list?.addEventListener('touchcancel', () => clearTimeout(_lpTimer), { passive: true });
  list?.addEventListener('touchend',    () => clearTimeout(_lpTimer), { passive: true });

  // Rechtsklick (Desktop)
  list?.addEventListener('contextmenu', (e) => {
    const item = e.target.closest('[data-asgn-id]');
    if (!item) return;
    e.preventDefault();
    _lpFired = true;
    _showContextMenu(item);
  });

  // Schnellaktionen + normaler Klick (mit Long-Press Guard)
  list?.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action-status]');
    if (actionBtn) {
      const id        = actionBtn.dataset.actionId;
      const newStatus = actionBtn.dataset.actionStatus;
      store.updateAssignmentStatus(id, newStatus);
      if (newStatus === 'completed') showToast('Auftrag als erledigt markiert', 'success');
      else if (newStatus === 'paid') showToast('Zahlung erfasst', 'success');
      return;
    }
    if (_lpFired) { _lpFired = false; return; }  // Long-Press → kein Modal
    const item = e.target.closest('[data-asgn-id]');
    if (item) openModal(item.dataset.asgnId);
  });

  // Neu-Button
  container.querySelector('#asgn-add-btn').addEventListener('click', () => openModal(null));

  // Abbrechen / Backdrop
  container.querySelector('#asgn-cancel').addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

  // Löschen
  container.querySelector('#asgn-delete')?.addEventListener('click', () => {
    if (!editingId) return;
    if (!confirm('Diesen Auftrag wirklich löschen?')) return;
    store.deleteAssignment(editingId);
    showToast('Auftrag gelöscht', 'info');
    closeModal();
  });

  // Formular-Submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = _getFormData(form);
    if (!data.clientId) { showToast('Bitte Auftraggeber auswählen', 'error'); return; }
    if (!data.date)     { showToast('Bitte Datum eingeben', 'error'); return; }

    if (editingId) {
      store.updateAssignment(editingId, data);
      showToast('Auftrag aktualisiert', 'success');
    } else {
      store.addAssignment(data);
      showToast('Auftrag gespeichert', 'success');
    }
    closeModal();
  });

  // Filter-Events – über data-filter Attribut eindeutig selektieren
  container.querySelector('[data-filter="year"]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-year]');
    if (!btn) return;
    filterYear = btn.dataset.year === 'all' ? 'all' : Number(btn.dataset.year);
    _render(container);
  });

  container.querySelector('[data-filter="client"]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-client]');
    if (!btn) return;
    filterClient = btn.dataset.client;
    _render(container);
  });

  container.querySelector('[data-filter="status"]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    filterStatus = btn.dataset.status;
    _render(container);
  });

  // FAB (falls von außen aufgerufen)
  window._openNewAssignment = () => openModal(null);
}

function _fillForm(form, a) {
  form.querySelector('[name="date"]').value       = a.date ?? '';
  form.querySelector('[name="clientId"]').value   = a.clientId ?? '';
  form.querySelector('[name="description"]').value= a.description ?? '';
  form.querySelector('[name="fee"]').value        = a.fee ?? '';
  form.querySelector('[name="km"]').value         = a.km ?? '';
  form.querySelector('[name="kmBillable"]').checked = !!a.kmBillable;
  form.querySelector('[name="status"]').value     = a.status ?? 'open';
  form.querySelector('[name="paidDate"]').value   = a.paidDate ?? '';
  form.querySelector('[name="note"]').value       = a.note ?? '';
  form.querySelector('[name="type"]').value       = a.type ?? 'mystery_shopping';
  form.querySelector('#paid-date-group').style.display = a.status === 'paid' ? '' : 'none';
}

function _getFormData(form) {
  const fd = new FormData(form);
  return {
    date:        fd.get('date') || null,
    clientId:    fd.get('clientId') || null,
    description: fd.get('description') || '',
    fee:         parseFloat(fd.get('fee')) || 0,
    km:          parseInt(fd.get('km'), 10) || 0,
    kmBillable:  form.querySelector('[name="kmBillable"]').checked,
    status:      fd.get('status') || 'open',
    paidDate:    fd.get('status') === 'paid' ? (fd.get('paidDate') || null) : null,
    note:        fd.get('note') || '',
    type:        fd.get('type') || 'mystery_shopping',
  };
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- Kontextmenü ----

function _createContextMenu() {
  // Vorhandene Elemente bereinigen (falls destroyAssignments nicht aufgerufen wurde)
  document.getElementById('ctx-backdrop')?.remove();
  document.getElementById('ctx-menu')?.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'ctx-backdrop';
  document.body.appendChild(backdrop);

  const menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.innerHTML = `
    <button data-ctx="edit">✏️ Bearbeiten</button>
    <button data-ctx="completed">✓ Als erledigt markieren</button>
    <button data-ctx="paid">💰 Als bezahlt markieren</button>
    <button data-ctx="duplicate">📋 Duplizieren</button>
    <hr class="ctx-divider">
    <button data-ctx="delete" class="ctx-danger">🗑 Löschen</button>
  `;
  document.body.appendChild(menu);

  backdrop.addEventListener('click', _hideContextMenu);

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ctx]');
    if (!btn) return;
    _handleContextAction(btn.dataset.ctx, menu.dataset.forId);
  });

  _escListener = (e) => { if (e.key === 'Escape') _hideContextMenu(); };
  document.addEventListener('keydown', _escListener);
}

function _showContextMenu(item) {
  const menu     = document.getElementById('ctx-menu');
  const backdrop = document.getElementById('ctx-backdrop');
  if (!menu || !backdrop) return;

  const id = item.dataset.asgnId;
  const a  = store.getAssignment(id);
  if (!a) return;

  // Status-abhängige Einträge ein-/ausblenden
  menu.querySelector('[data-ctx="completed"]').style.display = a.status === 'open'      ? '' : 'none';
  menu.querySelector('[data-ctx="paid"]').style.display      = a.status === 'completed' ? '' : 'none';

  // Positionierung: unter dem Item, innerhalb Viewport
  const rect  = item.getBoundingClientRect();
  const menuW = 220;
  const menuH = 210;
  let top  = rect.bottom + 6;
  let left = rect.left + 8;
  if (top  + menuH > window.innerHeight) top  = Math.max(8, rect.top - menuH - 6);
  if (left + menuW > window.innerWidth)  left = Math.max(8, window.innerWidth - menuW - 8);

  menu.style.top    = `${top}px`;
  menu.style.left   = `${left}px`;
  menu.dataset.forId = id;

  backdrop.classList.add('visible');
  menu.classList.add('visible');
}

function _hideContextMenu() {
  document.getElementById('ctx-backdrop')?.classList.remove('visible');
  document.getElementById('ctx-menu')?.classList.remove('visible');
}

function _handleContextAction(action, id) {
  _hideContextMenu();
  if (!id) return;
  const a = store.getAssignment(id);
  if (!a) return;

  switch (action) {
    case 'edit':
      _openModalFn?.(id);
      break;

    case 'completed':
      store.updateAssignmentStatus(id, 'completed');
      showToast('Als erledigt markiert', 'success');
      break;

    case 'paid':
      store.updateAssignmentStatus(id, 'paid');
      showToast('Zahlung erfasst', 'success');
      break;

    case 'duplicate': {
      const today = new Date().toISOString().slice(0, 10);
      store.addAssignment({
        clientId:    a.clientId,
        description: a.description,
        fee:         a.fee,
        km:          a.km,
        kmBillable:  a.kmBillable,
        type:        a.type,
        note:        a.note,
        date:        today,
        status:      'open',
        paidDate:    null,
      });
      showToast('Auftrag dupliziert', 'success');
      break;
    }

    case 'delete':
      if (!confirm('Diesen Auftrag wirklich löschen?')) return;
      store.deleteAssignment(id);
      showToast('Auftrag gelöscht', 'info');
      break;
  }
}
