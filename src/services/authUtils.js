/**
 * Auth-Hilfsfunktionen (rein, ohne DOM/Supabase – damit testbar).
 */

/**
 * Liest aus einer Supabase-Rate-Limit-Meldung die Wartesekunden.
 * Beispiel: "For security purposes, you can only request this after 35 seconds."
 * @returns {number|null} Sekunden oder null, wenn die Meldung kein Limit ist.
 */
export function cooldownSeconds(message) {
  const m = /after (\d+)\s*seconds?/i.exec(message ?? '');
  return m ? Number(m[1]) : null;
}
