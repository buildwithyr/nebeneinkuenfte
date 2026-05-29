/**
 * Export / Import Service
 * JSON-Vollbackup, CSV-Export für Steuer/Buchführung
 */

import { store } from './store.js';
import { formatDate } from './calculations.js';

export const exportService = {

  /** Vollständiger JSON-Export */
  exportJSON() {
    const data = store.getRawData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const date = new Date().toISOString().slice(0, 10);
    this._download(blob, `nebeneinkuenfte-backup-${date}.json`);
  },

  /** JSON-Import: Datei einlesen und importieren */
  async importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.version || !data.assignments) {
            throw new Error('Ungültiges Dateiformat – kein gültiges Nebeneinkünfte-Backup.');
          }
          store.importData(data);
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
      reader.readAsText(file);
    });
  },

  /** CSV-Export für Steuer / Buchführung */
  exportCSV(year) {
    const { assignments, clients, settings } = store;
    const all = year
      ? assignments.filter(a => new Date(a.date).getFullYear() === Number(year))
      : assignments;

    const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]));
    const kmRate = settings.kmRate ?? 0.42;

    const headers = [
      'Datum',
      'Auftraggeber',
      'Beschreibung',
      'Honorar (€)',
      'Kilometer',
      'Km verrechenbar',
      'Kilometergeld (€)',
      'Bezahlt',
      'Zahlungsdatum',
      'Typ',
      'Notiz',
    ];

    const rows = all
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(a => {
        const kmMoney = a.kmBillable ? (a.km ?? 0) * kmRate : 0;
        return [
          formatDate(a.date),
          clientMap[a.clientId] ?? '–',
          a.description ?? '',
          (a.fee ?? 0).toFixed(2),
          (a.km ?? 0).toString(),
          a.kmBillable ? 'Ja' : 'Nein',
          kmMoney.toFixed(2),
          a.paid ? 'Ja' : 'Nein',
          formatDate(a.paidDate),
          a.type ?? 'mystery_shopping',
          (a.note ?? '').replace(/"/g, '""'),
        ].map(v => `"${v}"`).join(';');
      });

    const csv = [headers.map(h => `"${h}"`).join(';'), ...rows].join('\r\n');
    const bom = '﻿'; // UTF-8 BOM für Excel-Kompatibilität
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
    const suffix = year ? `-${year}` : '';
    this._download(blob, `nebeneinkuenfte${suffix}.csv`);
  },

  _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  },
};
