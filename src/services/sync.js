/**
 * GitHub Gist Synchronisation
 *
 * Warum GitHub Gist?
 * - Kostenlos, kein Server nötig
 * - ~30 Einträge/Jahr → winzige Datenmenge (< 50 KB)
 * - Einfache REST API, kein OAuth-Flow nötig (PAT reicht)
 * - Privater Gist → Daten nicht öffentlich
 * - Alternative (Google Sheets) wäre einfacher für Nicht-Entwickler,
 *   aber erfordert Google-Konto und komplexeres OAuth
 *
 * Konfliktlösung: Last-Write-Wins mit lastModified-Timestamp
 * → Bei ~30 Einträgen/Jahr und 1-2 Geräten ausreichend
 */

import { store } from './store.js';

const GIST_API = 'https://api.github.com/gists';
const FILENAME = 'nebeneinkuenfte-data.json';

export const syncService = {

  get isConfigured() {
    const { gistToken, gistId } = store.settings;
    return !!(gistToken && gistId);
  },

  /**
   * Neuen Gist anlegen (einmalig bei Setup)
   * Gibt die neue Gist-ID zurück
   */
  async createGist(token) {
    const resp = await fetch(GIST_API, {
      method: 'POST',
      headers: this._headers(token),
      body: JSON.stringify({
        description: 'Nebeneinkünfte Tracker – Backup (nicht manuell bearbeiten)',
        public: false,
        files: {
          [FILENAME]: {
            content: JSON.stringify(store.getRawData(), null, 2),
          },
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message ?? `GitHub API Fehler: ${resp.status}`);
    }

    const gist = await resp.json();
    return gist.id;
  },

  /**
   * Lokale Daten → Gist hochladen
   */
  async push() {
    this._assertConfigured();
    const { gistToken, gistId } = store.settings;

    const resp = await fetch(`${GIST_API}/${gistId}`, {
      method: 'PATCH',
      headers: this._headers(gistToken),
      body: JSON.stringify({
        files: {
          [FILENAME]: {
            content: JSON.stringify(store.getRawData(), null, 2),
          },
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message ?? `GitHub API Fehler: ${resp.status}`);
    }

    store.updateSettings({ lastSyncAt: new Date().toISOString() });
    return true;
  },

  /**
   * Gist → lokale Daten herunterladen
   * Vergleicht lastModified-Timestamps
   */
  async pull() {
    this._assertConfigured();
    const { gistToken, gistId } = store.settings;

    const resp = await fetch(`${GIST_API}/${gistId}`, {
      headers: this._headers(gistToken),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message ?? `GitHub API Fehler: ${resp.status}`);
    }

    const gist = await resp.json();
    const file = gist.files?.[FILENAME];
    if (!file) throw new Error(`Datei "${FILENAME}" nicht im Gist gefunden.`);

    const remote = JSON.parse(file.content);
    if (!remote.version) throw new Error('Ungültiges Datenformat im Gist.');

    return remote;
  },

  /**
   * Bidirektionale Synchronisation:
   * - Wenn Remote neuer → Remote gewinnt
   * - Wenn Lokal neuer → Push
   * - Wenn gleich → kein Upload nötig
   */
  async sync() {
    this._assertConfigured();

    const local = store.getRawData();
    const remote = await this.pull();

    const localTime  = new Date(local.meta?.lastModified ?? 0).getTime();
    const remoteTime = new Date(remote.meta?.lastModified ?? 0).getTime();

    if (remoteTime > localTime) {
      // Remote ist neuer → importieren
      store.importData(remote);
      store.updateSettings({ lastSyncAt: new Date().toISOString() });
      return { direction: 'pull', message: 'Remote-Daten importiert (Remote war neuer).' };
    } else if (localTime > remoteTime) {
      // Lokal ist neuer → hochladen
      await this.push();
      return { direction: 'push', message: 'Lokale Daten hochgeladen (Lokal war neuer).' };
    } else {
      store.updateSettings({ lastSyncAt: new Date().toISOString() });
      return { direction: 'none', message: 'Bereits synchron.' };
    }
  },

  _headers(token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };
  },

  _assertConfigured() {
    if (!this.isConfigured) {
      throw new Error('GitHub Sync nicht konfiguriert. Bitte Token und Gist-ID in den Einstellungen eingeben.');
    }
  },
};
