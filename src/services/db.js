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

export const db = {
  _userId: null,
  _channel: null,

  setUserId(id) {
    this._userId = id;
  },

  /** Alle Daten des Users aus Supabase laden */
  async loadAll() {
    const [clientsRes, assignmentsRes, settingsRes] = await Promise.all([
      supabase.from('clients').select('*').order('created_at'),
      supabase.from('assignments').select('*').order('created_at'),
      supabase.from('user_settings').select('settings').eq('user_id', this._userId).maybeSingle(),
    ]);

    if (clientsRes.error) throw new Error('Clients laden fehlgeschlagen: ' + clientsRes.error.message);
    if (assignmentsRes.error) throw new Error('Aufträge laden fehlgeschlagen: ' + assignmentsRes.error.message);

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
      supabase.from('clients').upsert(clients.map(c => _clientToRow(c, userId))),
      supabase.from('assignments').upsert(assignments.map(a => _assignmentToRow(a, userId))),
      supabase.from('user_settings').upsert({
        user_id: userId,
        settings: _sanitizeSettings(settings),
        updated_at: new Date().toISOString(),
      }),
    ]);
  },

  async upsertClient(client) {
    if (!this._userId) return;
    const { error } = await supabase.from('clients').upsert(_clientToRow(client, this._userId));
    if (error) console.error('[DB] upsertClient:', error.message);
  },

  async deleteClient(id) {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) console.error('[DB] deleteClient:', error.message);
  },

  async upsertAssignment(assignment) {
    if (!this._userId) return;
    const { error } = await supabase.from('assignments').upsert(_assignmentToRow(assignment, this._userId));
    if (error) console.error('[DB] upsertAssignment:', error.message);
  },

  async deleteAssignment(id) {
    const { error } = await supabase.from('assignments').delete().eq('id', id);
    if (error) console.error('[DB] deleteAssignment:', error.message);
  },

  async saveSettings(settings) {
    if (!this._userId) return;
    const { error } = await supabase.from('user_settings').upsert({
      user_id: this._userId,
      settings: _sanitizeSettings(settings),
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('[DB] saveSettings:', error.message);
  },

  /**
   * Realtime-Abonnement starten.
   * Callbacks erhalten { type: 'INSERT'|'UPDATE'|'DELETE', record: ... }
   */
  subscribeRealtime({ onClient, onAssignment }) {
    if (this._channel) supabase.removeChannel(this._channel);
    const userId = this._userId;

    this._channel = supabase
      .channel('db-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'clients',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        onClient({
          type: payload.eventType,
          record: payload.eventType === 'DELETE' ? payload.old : _rowToClient(payload.new),
        });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'assignments',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        onAssignment({
          type: payload.eventType,
          record: payload.eventType === 'DELETE' ? payload.old : _rowToAssignment(payload.new),
        });
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[DB] Realtime verbunden ✓');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[DB] Realtime Fehler:', status, err);
        }
      });
  },

  unsubscribeRealtime() {
    if (this._channel) {
      supabase.removeChannel(this._channel);
      this._channel = null;
    }
  },
};
