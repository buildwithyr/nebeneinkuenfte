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
  kmRate: 0.42, // Kilometergeld Österreich 2024/2025
  reserveRate: 0.4, // Empfohlene Steuerrücklage (40%)
  primaryIncomeGross: 46000, // Bruttogehalt Hauptberuf (Schätzung aus 33k netto)
  useAutomaticTaxRate: true, // Österreichischer Grenzsteuersatz automatisch
  manualTaxRate: 0.4, // Manuell überschreibbarer Steuersatz
  theme: 'dark',
  gistId: '',
  gistToken: '',
  lastSyncAt: null,
};

const DEFAULT_CLIENTS = [
  {
    id: 'client-1',
    name: 'Whitebox',
    note: 'IQOS Mystery Shopping',
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'client-2',
    name: 'Langl & Partner',
    note: '',
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'client-3',
    name: 'Concertare',
    note: '',
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'client-4',
    name: 'Market Mind',
    note: 'Online-Diskussionen, Umfragen',
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'client-5',
    name: 'Mystery Agency',
    note: '',
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
];

class Store {
  constructor() {
    this._data = null;
    this._listeners = {};
    this._syncHooks = null;
  }

  /** Supabase-Sync aktivieren – nach erfolgreichem Login aufrufen */
  enableSync(hooks) {
    this._syncHooks = hooks;
  }

  disableSync() {
    this._syncHooks = null;
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

  get settings() {
    return this._data.settings;
  }
  get clients() {
    return this._data.clients;
  }
  get assignments() {
    return this._data.assignments;
  }
  get meta() {
    return this._data.meta;
  }

  getClient(id) {
    return this._data.clients.find((c) => c.id === id) ?? null;
  }

  getAssignment(id) {
    return this._data.assignments.find((a) => a.id === id) ?? null;
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
    this._syncHooks?.onSettingsChange?.(this._data.settings);
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
    this._syncHooks?.onClientChange?.(newClient, false);
    return newClient;
  }

  updateClient(id, patch) {
    const idx = this._data.clients.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    this._data.clients[idx] = { ...this._data.clients[idx], ...patch };
    this._save();
    this._emit('clients');
    this._syncHooks?.onClientChange?.(this._data.clients[idx], false);
    return true;
  }

  deleteClient(id) {
    this._syncHooks?.onClientChange?.({ id }, true);
    this._data.clients = this._data.clients.filter((c) => c.id !== id);
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
    this._syncHooks?.onAssignmentChange?.(newAssignment, false);
    return newAssignment;
  }

  updateAssignment(id, patch) {
    const idx = this._data.assignments.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    this._data.assignments[idx] = {
      ...this._data.assignments[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this._save();
    this._emit('assignments');
    this._syncHooks?.onAssignmentChange?.(this._data.assignments[idx], false);
    return true;
  }

  updateAssignmentStatus(id, status) {
    const VALID = ['open', 'completed', 'paid'];
    if (!VALID.includes(status)) return false;
    const patch = { status };
    if (status === 'paid') patch.paidDate = new Date().toISOString().slice(0, 10);
    return this.updateAssignment(id, patch);
  }

  deleteAssignment(id) {
    this._syncHooks?.onAssignmentChange?.({ id }, true);
    this._data.assignments = this._data.assignments.filter((a) => a.id !== id);
    this._save();
    this._emit('assignments');
  }

  /** Supabase-Daten in den lokalen Store laden (nach Login) */
  importFromSupabase({ clients, assignments, settings }) {
    this._data.clients = clients;
    this._data.assignments = assignments.map(_migrateAssignment);
    if (settings) {
      // Supabase-Settings gewinnen, aber Gist-Credentials und Theme bleiben lokal
      const { theme } = this._data.settings;
      this._data.settings = { ...DEFAULT_SETTINGS, ...settings, theme };
    }
    this._applyTheme();
    this._save();
    this._emit('clients');
    this._emit('assignments');
    this._emit('settings');
  }

  /** Vollständigen Daten-Snapshot importieren (z.B. nach JSON-Import) */
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

  // ---- Realtime (von anderem Gerät) ----

  applyRealtimeClient({ type, record }) {
    if (type === 'DELETE') {
      const before = this._data.clients.length;
      this._data.clients = this._data.clients.filter((c) => c.id !== record.id);
      if (this._data.clients.length === before) return; // schon weg → Echo, ignorieren
    } else {
      const idx = this._data.clients.findIndex((c) => c.id === record.id);
      if (idx >= 0) {
        const cur = this._data.clients[idx];
        // Echo der eigenen Änderung? Inhaltlich identisch → kein Re-render.
        if (cur.name === record.name && cur.note === record.note && cur.active === record.active)
          return;
        this._data.clients[idx] = { ...cur, ...record };
      } else {
        this._data.clients.push(record);
      }
    }
    this._save();
    this._emit('clients');
  }

  applyRealtimeAssignment({ type, record }) {
    if (type === 'DELETE') {
      const before = this._data.assignments.length;
      this._data.assignments = this._data.assignments.filter((a) => a.id !== record.id);
      if (this._data.assignments.length === before) return; // schon weg → Echo, ignorieren
    } else {
      const idx = this._data.assignments.findIndex((a) => a.id === record.id);
      if (idx >= 0) {
        // Echo der eigenen Änderung? Gleicher updatedAt-Stand → kein Re-render.
        if (this._data.assignments[idx].updatedAt === record.updatedAt) return;
        this._data.assignments[idx] = { ...this._data.assignments[idx], ...record };
      } else {
        this._data.assignments.push(_migrateAssignment(record));
      }
    }
    this._save();
    this._emit('assignments');
  }

  // ---- Pub/Sub ----

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return () => {
      this._listeners[event] = this._listeners[event].filter((f) => f !== fn);
    };
  }

  _emit(event) {
    (this._listeners[event] ?? []).forEach((fn) => fn());
    (this._listeners['*'] ?? []).forEach((fn) => fn(event));
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
