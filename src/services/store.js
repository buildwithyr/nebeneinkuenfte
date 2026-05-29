/**
 * Central State Store – pub/sub pattern
 *
 * Alle Komponenten kommunizieren über den Store.
 * Direkte DOM-Manipulation bleibt in den Komponenten.
 */

import { storage } from './storage.js';

const DEFAULT_SETTINGS = {
  currency: 'EUR',
  currencySymbol: '€',
  kmRate: 0.42,           // Kilometergeld Österreich 2024/2025
  reserveRate: 0.40,      // Empfohlene Steuerrücklage (40%)
  primaryIncomeGross: 46000, // Bruttogehalt Hauptberuf (Schätzung aus 33k netto)
  useAutomaticTaxRate: true, // Österreichischer Grenzsteuersatz automatisch
  manualTaxRate: 0.40,    // Manuell überschreibbarer Steuersatz
  theme: 'dark',
  gistId: '',
  gistToken: '',
  lastSyncAt: null,
};

const DEFAULT_CLIENTS = [
  { id: 'client-1', name: 'Whitebox', note: 'IQOS Mystery Shopping', active: true, createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'client-2', name: 'Langl & Partner', note: '', active: true, createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'client-3', name: 'Concertare', note: '', active: true, createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'client-4', name: 'Market Mind', note: 'Online-Diskussionen, Umfragen', active: true, createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'client-5', name: 'Mystery Agency', note: '', active: true, createdAt: '2024-01-01T00:00:00.000Z' },
];

class Store {
  constructor() {
    this._data = null;
    this._listeners = {};
  }

  /** Daten aus localStorage laden (oder Defaults) */
  init() {
    const saved = storage.load();
    if (saved && saved.version) {
      // Migration: fehlende Felder ergänzen
      this._data = {
        version: '1.0',
        meta: { lastModified: new Date().toISOString(), deviceId: this._getDeviceId() },
        settings: { ...DEFAULT_SETTINGS, ...saved.settings },
        clients: saved.clients ?? DEFAULT_CLIENTS,
        assignments: (saved.assignments ?? []).map(_migrateAssignment),
      };
    } else {
      this._data = {
        version: '1.0',
        meta: { lastModified: new Date().toISOString(), deviceId: this._getDeviceId() },
        settings: { ...DEFAULT_SETTINGS },
        clients: DEFAULT_CLIENTS,
        assignments: [],
      };
    }
    this._applyTheme();
  }

  // ---- Getters ----

  get settings() { return this._data.settings; }
  get clients()   { return this._data.clients; }
  get assignments() { return this._data.assignments; }
  get meta()      { return this._data.meta; }

  getClient(id) {
    return this._data.clients.find(c => c.id === id) ?? null;
  }

  getAssignment(id) {
    return this._data.assignments.find(a => a.id === id) ?? null;
  }

  /** Rohes Datenobjekt für Export/Sync */
  getRawData() {
    return { ...this._data };
  }

  // ---- Mutators ----

  updateSettings(patch) {
    this._data.settings = { ...this._data.settings, ...patch };
    if (patch.theme !== undefined) this._applyTheme();
    this._save();
    this._emit('settings');
  }

  addClient(client) {
    const newClient = {
      id: this._generateId('client'),
      createdAt: new Date().toISOString(),
      active: true,
      note: '',
      ...client,
    };
    this._data.clients.push(newClient);
    this._save();
    this._emit('clients');
    return newClient;
  }

  updateClient(id, patch) {
    const idx = this._data.clients.findIndex(c => c.id === id);
    if (idx === -1) return false;
    this._data.clients[idx] = { ...this._data.clients[idx], ...patch };
    this._save();
    this._emit('clients');
    return true;
  }

  deleteClient(id) {
    this._data.clients = this._data.clients.filter(c => c.id !== id);
    this._save();
    this._emit('clients');
  }

  addAssignment(assignment) {
    const newAssignment = {
      id: this._generateId('asgn'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: 'mystery_shopping',
      status: 'open',
      paidDate: null,
      km: 0,
      kmBillable: false,
      note: '',
      ...assignment,
    };
    this._data.assignments.push(newAssignment);
    this._save();
    this._emit('assignments');
    return newAssignment;
  }

  updateAssignment(id, patch) {
    const idx = this._data.assignments.findIndex(a => a.id === id);
    if (idx === -1) return false;
    this._data.assignments[idx] = {
      ...this._data.assignments[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this._save();
    this._emit('assignments');
    return true;
  }

  deleteAssignment(id) {
    this._data.assignments = this._data.assignments.filter(a => a.id !== id);
    this._save();
    this._emit('assignments');
  }

  /** Vollständigen Daten-Snapshot importieren (z.B. nach Gist-Sync) */
  importData(raw) {
    this._data = {
      version: '1.0',
      meta: { ...raw.meta, deviceId: this._getDeviceId() },
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
      clients: raw.clients ?? [],
      assignments: (raw.assignments ?? []).map(_migrateAssignment),
    };
    this._applyTheme();
    this._save();
    this._emit('settings');
    this._emit('clients');
    this._emit('assignments');
  }

  // ---- Pub/Sub ----

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return () => { this._listeners[event] = this._listeners[event].filter(f => f !== fn); };
  }

  _emit(event) {
    (this._listeners[event] ?? []).forEach(fn => fn());
    (this._listeners['*'] ?? []).forEach(fn => fn(event));
  }

  // ---- Helpers ----

  _save() {
    this._data.meta.lastModified = new Date().toISOString();
    storage.save(this._data);
  }

  _applyTheme() {
    document.documentElement.setAttribute('data-theme', this._data.settings.theme ?? 'dark');
  }

  _generateId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  _getDeviceId() {
    let id = localStorage.getItem('neb_device_id');
    if (!id) {
      id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem('neb_device_id', id);
    }
    return id;
  }
}

export const store = new Store();

/** Migration: paid:boolean → status:'open'|'completed'|'paid' */
function _migrateAssignment(a) {
  if (a.status) return a; // already migrated
  const status = a.paid ? 'paid' : 'open';
  const { paid, ...rest } = a; // remove legacy field
  return { ...rest, status };
}
