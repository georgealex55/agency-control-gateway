/** Staging-only read-only readiness service using trusted session authorization and injected pools. */
export function createClientReadinessService(access, {timeoutMs = 3000} = {}) {
  if (!access || typeof access.withSession !== 'function' || !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid readiness dependencies');
  return Object.freeze({
    async check(token, clientId) {
      try {
        return await access.withSession(token, clientId, 'app', async (pool, binding) => {
          if (binding.clientId !== clientId || binding.role !== 'app' || typeof pool.connect !== 'function')
            throw new Error('Binding mismatch');
          const conn = await pool.connect();
          if (!conn || typeof conn.query !== 'function' || typeof conn.release !== 'function') {
            if (conn && typeof conn.release === 'function') conn.release();
            throw new Error('Invalid connection');
          }
          try {
            // Driver must enforce query_timeout; Promise.race does not cancel PostgreSQL queries.
            const result = await conn.query({text:'SELECT 1 AS reach_health',values:[],query_timeout:timeoutMs});
            if (!Array.isArray(result?.rows) || result.rows.length !== 1 ||
                result.rows[0]?.reach_health !== 1) throw new Error('Invalid probe response');
            return Object.freeze({clientId,status:'healthy'});
          } finally { conn.release(); }
        });
      } catch {
        return Object.freeze({clientId:typeof clientId === 'string' ? clientId : '',status:'unavailable'});
      }
    },
  });
}
