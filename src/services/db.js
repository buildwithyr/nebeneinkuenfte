/**
 * Supabase Database Service
 *
 * Alle Datenbankoperationen (CRUD + Realtime).
 * Konvertiert zwischen lokalem camelCase-Format und Supabase snake_case-Rows.
 */

import { supabase } from './supabase.js';

// ---- Row converters ----

function _clientToRow(client, userId) {
  return {
    id: client.id,
    user_id: userId,
    name: client.name,
    note: client.note ?? '',
    active: client.active ?? true,
    created_at: client.createdAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function _rowToClient(row) {
  return {
    id: row.id,
    name: row.name,
    note: row.note ?? '',
    active: row.active ?? true,
    createdAt: row.created_at,
  };
}

function _assignmentToRow(a, userId) {
  return {
    id: a.id,
    user_id: userId,
    date: a.date,
    client_id: a.clientId,
    description: a.description ?? '',
    fee: a.fee ?? 0,
    km: a.km ?? 0,
    km_billable: a.kmBillable ?? false,
    status: a.status ?? 'open',
    paid_date: a.paidDate ?? null,
    type: a.type ?? 'mystery_shopping',
    note: a.note ?? '',
    created_at: a.createdAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function _rowToAssignment(row) {
  return {
    id: row.id,
    date: row.date,
    clientId: row.client_id,
    description: row.description ?? '',
    fee: parseFloat(row.fee) || 0,
    km: parseInt(row.km) || 0,
    kmBillable: row.km_billable ?? false,
    status: row.status ?? 'open',
    paidDate: row.paid_date ?? null,
    type: row.type ?? 'mystery_shopping',
    note: row.note ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function _sanitizeSettings(settings) {
  // gistToken/gistId sind Geräte-spezifisch und werden nicht in der Cloud gespeichert
  const { gistToken, gistId, ...rest } = settings;
  return rest;
}

// ---- DB service ----

const PENDING_KEY = 'neb_pending_ops';

export const db = {
  _userId: null,
  _channel: null,

  setUserId(id) {
    this._userId = id;
  },

  // ---- Offline-Queue ----
  // Schlägt eine Schreiboperation fehl (z.B. offline), wird sie persistent
  // in localStorage zwischengespeichert und beim nächsten Sync nachgeholt.
  // So gehen offline erfasste Änderungen nicht durch den Remote-Overwrite verloren.

  _loadPending() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY)) ?? [];
    } catch {
      return [];
    }
  },

  _savePending(queue) {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(queue));
    } catch {}
  },

  _enqueue(op) {
    const queue = this._loadPending();
    queue.push(op);
    this._savePending(queue);
  },

  async _execOp(op) {
    const userId = this._userId;
    let res;
    switch (op.kind) {
      case 'upsertClient':
        res = await supabase.from('clients').upsert(_clientToRow(op.payload, userId));
        break;
      case 'deleteClient':
        res = await supabase.from('clients').delete().eq('id', op.payload).eq('user_id', userId);
        break;
      case 'upsertAssignment':
        res = await supabase.from('assignments').upsert(_assignmentToRow(op.payload, userId));
        break;
      case 'deleteAssignment':
        res = await supabase
          .from('assignments')
          .delete()
          .eq('id', op.payload)
          .eq('user_id', userId);
        break;
      case 'saveSettings':
        res = await supabase.from('user_settings').upsert({
          user_id: userId,
          settings: _sanitizeSettings(op.payload),
          updated_at: new Date().toISOString(),
        });
        break;
      default:
        return; // unbekannte Op verwerfen
    }
    if (res?.error) throw new Error(res.error.message);
  },

  /**
   * Ausstehende (offline angefallene) Schreiboperationen nachholen.
   * Erfolgreiche werden entfernt, fehlgeschlagene bleiben in der Queue.
   * MUSS vor jedem db.loadAll() laufen, damit lokale Edits nicht überschrieben werden.
   */
  async flushPending() {
    if (!this._userId) return;
    const queue = this._loadPending();
    if (!queue.length) return;

    const remaining = [];
    for (const op of queue) {
      try {
        await this._execOp(op);
      } catch (err) {
        console.warn('[DB] Pending-Op verschoben:', op.kind, err?.message ?? err);
        remaining.push(op);
      }
    }
    this._savePending(remaining);
  },

  /** Alle Daten des Users aus Supabase laden */
  async loadAll() {
    const [clientsRes, assignmentsRes, settingsRes] = await Promise.all([
      supabase.from('clients').select('*').order('created_at'),
      supabase.from('assignments').select('*').order('created_at'),
      supabase.from('user_settings').select('settings').eq('user_id', this._userId).maybeSingle(),
    ]);

    if (clientsRes.error)
      throw new Error('Clients laden fehlgeschlagen: ' + clientsRes.error.message);
    if (assignmentsRes.error)
      throw new Error('Aufträge laden fehlgeschlagen: ' + assignmentsRes.error.message);

    return {
      clients: (clientsRes.data ?? []).map(_rowToClient),
      assignments: (assignmentsRes.data ?? []).map(_rowToAssignment),
      settings: settingsRes.data?.settings ?? null,
    };
  },

  /** Lokale Daten initial nach Supabase hochladen (erster Login-Geräte-Transfer) */
  async pushAll(clients, assignments, settings) {
    if (!this._userId) return;
    const userId = this._userId;
    await Promise.all([
      supabase.from('clients').upsert(clients.map((c) => _clientToRow(c, userId))),
      supabase.from('assignments').upsert(assignments.map((a) => _assignmentToRow(a, userId))),
      supabase.from('user_settings').upsert({
        user_id: userId,
        settings: _sanitizeSettings(settings),
        updated_at: new Date().toISOString(),
      }),
    ]);
  },

  // Mutatoren reihen die Operation in die Queue ein und versuchen sofort zu flushen.
  // Klappt der Flush (offline / Fehler) nicht, bleibt die Op persistent erhalten.

  async upsertClient(client) {
    if (!this._userId) return;
    this._enqueue({ kind: 'upsertClient', payload: client });
    await this.flushPending();
  },

  async deleteClient(id) {
    if (!this._userId) return;
    this._enqueue({ kind: 'deleteClient', payload: id });
    await this.flushPending();
  },

  async upsertAssignment(assignment) {
    if (!this._userId) return;
    this._enqueue({ kind: 'upsertAssignment', payload: assignment });
    await this.flushPending();
  },

  async deleteAssignment(id) {
    if (!this._userId) return;
    this._enqueue({ kind: 'deleteAssignment', payload: id });
    await this.flushPending();
  },

  async saveSettings(settings) {
    if (!this._userId) return;
    this._enqueue({ kind: 'saveSettings', payload: settings });
    await this.flushPending();
  },

  /**
   * Realtime-Abonnement starten.
   * Callbacks erhalten { type: 'INSERT'|'UPDATE'|'DELETE', record: ... }
   */
  subscribeRealtime(callbacks) {
    // Callbacks merken, damit reconnectRealtime() ohne Argumente funktioniert
    if (callbacks) this._callbacks = callbacks;
    const { onClient, onAssignment } = this._callbacks ?? {};
    if (!onClient || !onAssignment) return;

    if (this._channel) {
      supabase.removeChannel(this._channel);
      this._channel = null;
    }
    const userId = this._userId;

    this._channel = supabase
      .channel('db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clients',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onClient({
            type: payload.eventType,
            record: payload.eventType === 'DELETE' ? payload.old : _rowToClient(payload.new),
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assignments',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onAssignment({
            type: payload.eventType,
            record: payload.eventType === 'DELETE' ? payload.old : _rowToAssignment(payload.new),
          });
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[DB] Realtime verbunden ✓');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[DB] Realtime getrennt:', status, err?.message ?? '');
          // Einmaliger verzögerter Reconnect-Versuch (z.B. nach Netzwechsel)
          clearTimeout(this._reconnectTimer);
          this._reconnectTimer = setTimeout(() => this.reconnectRealtime(), 3000);
        }
      });
  },

  /** Realtime-Kanal neu aufbauen (z.B. nach App-Resume / Netzwechsel) */
  reconnectRealtime() {
    if (!this._userId || !this._callbacks) return;
    this.subscribeRealtime();
  },

  unsubscribeRealtime() {
    clearTimeout(this._reconnectTimer);
    this._callbacks = null;
    if (this._channel) {
      supabase.removeChannel(this._channel);
      this._channel = null;
    }
  },
};
