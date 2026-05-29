/**
 * LocalStorage Persistence Layer
 * Einfache Kapselung mit Error Handling und Kompressionshinweis
 */

const STORAGE_KEY = 'nebeneinkuenfte_v1';

export const storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error('[Storage] Laden fehlgeschlagen:', err);
      return null;
    }
  },

  save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      // QuotaExceededError: localStorage voll
      console.error('[Storage] Speichern fehlgeschlagen:', err);
      return false;
    }
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },

  /** Schätzung der aktuellen Datengröße in KB */
  sizeKb() {
    const raw = localStorage.getItem(STORAGE_KEY) ?? '';
    return (new Blob([raw]).size / 1024).toFixed(1);
  },
};
