/**
 * Auftraggeber-Verwaltung
 */

import { store } from '../services/store.js';
import { showToast } from '../app.js';
import { escapeHtml } from '../services/calculations.js';

export function renderClients(container) {
  _render(container);
  const u1 = store.on('clients',     () => _render(container));
  const u2 = store.on('assignments', () => _render(container));
  container._clientsUnsub = () => { u1(); u2(); };
}

export function destroyClients(container) {
  container._clientsUnsub?.();
}

function _render(container) {
  const { clients, assignments } = store;

  // Statistik: wie viele Aufträge pro Auftraggeber
  const countMap = {};
  for (const a of assignments) {
    countMap[a.clientId] = (countMap[a.clientId] ?? 0) + 1;
  }
  const feeMap = {};
  for (const a of assignments) {
    feeMap[a.clientId] = (feeMap[a.clientId] ?? 0) + (a.fee ?? 0);
  }

  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'de'));

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div>
        <div class="page-title">Auftraggeber</div>
        <div class="page-subtitle">${clients.length} Einträge</div>
      </div>
      <button class="btn btn-primary btn-sm" id="cl-add-btn">+ Neu</button>
    </div>

    <div class="list" id="cl-list">
      ${sorted.length === 0
        ? `<div class="empty-state">
            <div class="empty-icon">🏢</div>
            <div class="empty-title">Keine Auftraggeber</div>
           </div>`
        : sorted.map(c => _renderItem(c, countMap[c.id] ?? 0, feeMap[c.id] ?? 0)).join('')
      }
    </div>

    <!-- Modal -->
    <div class="modal-backdrop" id="cl-modal-backdrop">
      <div class="modal" id="cl-modal">
        <div class="modal-handle"></div>
        <div class="modal-title" id="cl-modal-title">Neuer Auftraggeber</div>
        <form id="cl-form">
          <div class="form-group">
            <label class="form-label">Name <span class="required">*</span></label>
            <input type="text" class="form-control" name="name" placeholder="z.B. Whitebox" required>
          </div>
          <div class="form-group">
            <label class="form-label">Notiz</label>
            <textarea class="form-control" name="note" rows="2" placeholder="Interne Notiz, Ansprechpartner…"></textarea>
          </div>
          <div class="form-group">
            <div class="switch-row">
              <label class="switch-label">Aktiv</label>
              <label class="switch">
                <input type="checkbox" name="active" checked>
                <span class="switch-track"></span>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="cl-cancel">Abbrechen</button>
            <button type="submit" class="btn btn-primary">Speichern</button>
          </div>
          <div id="cl-delete-zone" class="hidden mt-3">
            <button type="button" class="btn btn-danger btn-full" id="cl-delete">Auftraggeber löschen</button>
          </div>
        </form>
      </div>
    </div>
  `;

  _attachListeners(container);
}

function _renderItem(c, count, fee) {
  const sym = store.settings.currencySymbol ?? '€';
  return `
    <div class="list-item" data-client-id="${c.id}">
      <div class="list-item-main">
        <div class="list-item-title">${_esc(c.name)}</div>
        <div class="list-item-meta">
          ${count} Aufträge
          ${c.note ? `· ${_esc(c.note)}` : ''}
        </div>
        <div class="mt-1">
          ${c.active
            ? '<span class="badge badge-success">Aktiv</span>'
            : '<span class="badge badge-muted">Inaktiv</span>'}
        </div>
      </div>
      <div class="list-item-value">${sym} ${fee.toLocaleString('de-AT', {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
    </div>
  `;
}

function _attachListeners(container) {
  const backdrop   = container.querySelector('#cl-modal-backdrop');
  const modal      = container.querySelector('#cl-modal');
  const form       = container.querySelector('#cl-form');
  const title      = container.querySelector('#cl-modal-title');
  const deleteZone = container.querySelector('#cl-delete-zone');
  let editingId    = null;

  function openModal(clientId) {
    editingId = clientId ?? null;
    title.textContent = editingId ? 'Auftraggeber bearbeiten' : 'Neuer Auftraggeber';
    deleteZone.classList.toggle('hidden', !editingId);

    if (editingId) {
      const c = store.getClient(editingId);
      if (c) {
        form.querySelector('[name="name"]').value  = c.name ?? '';
        form.querySelector('[name="note"]').value  = c.note ?? '';
        form.querySelector('[name="active"]').checked = c.active !== false;
      }
    } else {
      form.reset();
      form.querySelector('[name="active"]').checked = true;
    }

    backdrop.classList.add('visible');
    setTimeout(() => modal.classList.add('visible'), 10);
  }

  function closeModal() {
    modal.classList.remove('visible');
    setTimeout(() => backdrop.classList.remove('visible'), 300);
    editingId = null;
  }

  container.querySelector('#cl-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-client-id]');
    if (item) openModal(item.dataset.clientId);
  });

  container.querySelector('#cl-add-btn').addEventListener('click', () => openModal(null));
  container.querySelector('#cl-cancel').addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

  container.querySelector('#cl-delete').addEventListener('click', () => {
    if (!editingId) return;
    const hasAssignments = store.assignments.some(a => a.clientId === editingId);
    if (hasAssignments) {
      showToast('Auftraggeber hat Aufträge – erst Aufträge entfernen oder umweisen.', 'error');
      return;
    }
    if (!confirm('Auftraggeber wirklich löschen?')) return;
    store.deleteClient(editingId);
    showToast('Auftraggeber gelöscht', 'info');
    closeModal();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = {
      name:   fd.get('name')?.trim(),
      note:   fd.get('note')?.trim() ?? '',
      active: form.querySelector('[name="active"]').checked,
    };

    if (!data.name) { showToast('Bitte Namen eingeben', 'error'); return; }

    if (editingId) {
      store.updateClient(editingId, data);
      showToast('Auftraggeber aktualisiert', 'success');
    } else {
      store.addClient(data);
      showToast('Auftraggeber gespeichert', 'success');
    }
    closeModal();
  });
}

const _esc = escapeHtml;
