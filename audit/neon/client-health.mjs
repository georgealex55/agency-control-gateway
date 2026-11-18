/** Staging-only, read-only tenant database health probe. No network driver is bundled. */
export function createClientHealthProbe(authorizedAccess, options = {}) {
  if (!authorizedAccess || typeof authorizedAccess.withClient !== 'function') throw new TypeError('Authorized access required');
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid timeout');
  return Object.freeze({
    async check(sessionToken, clientId) {
      if (typeof clientId !== 'string' || !clientId) throw new Error('Invalid client');
      // Authorization occurs before any database operation. Do not expose error details or credentials.
      return authorizedAccess.withClient(sessionToken, clientId, async (db, boundClientId) => {
        if (boundClientId !== clientId) throw new Error('Client binding mismatch');
        if (!db || typeof db.query !== 'function') throw new Error('Read-only query adapter required');
        // Adapter must enforce timeout at the driver/server level; JS Promise.race does not cancel queries.
        const result = await db.query('SELECT 1 AS reach_health', [], { readOnly: true, timeoutMs });
        const rows = Array.isArray(result) ? result : result?.rows;
        if (!Array.isArray(rows) || rows.length !== 1 || Number(rows[0]?.reach_health) !== 1) {
          throw new Error('Health probe failed');
        }
        return Object.freeze({ clientId: boundClientId, status: 'healthy' });
      });
    },
  });
}
