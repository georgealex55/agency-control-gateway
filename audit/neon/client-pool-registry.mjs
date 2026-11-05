/** Staging-only, injected PostgreSQL pool selector. No network or secrets are resolved here. */
export function createClientPoolRegistry(bindings, poolFactory) {
  if (!Array.isArray(bindings) || !bindings.length || typeof poolFactory !== 'function') throw new TypeError('Bindings and factory required');
  const registry = new Map(), projects = new Map(), identities = new Set();
  for (const b of bindings) {
    if (!b || typeof b.clientId !== 'string' || !/^[\w-]{3,80}$/.test(b.clientId) ||
        typeof b.projectId !== 'string' || !/^[\w-]{3,120}$/.test(b.projectId) ||
        !['app','migration'].includes(b.role) || typeof b.secretRef !== 'string' ||
        !/^secret:[\w/-]{3,180}$/.test(b.secretRef)) throw new TypeError('Invalid client pool binding');
    const key = b.clientId + ':' + b.role;
    if (registry.has(key)) throw new Error('Duplicate client role');
    if (projects.has(b.clientId) && projects.get(b.clientId) !== b.projectId) throw new Error('Client project mismatch');
    projects.set(b.clientId, b.projectId);
    registry.set(key, Object.freeze({...b}));
  }
  if (new Set(projects.values()).size !== projects.size) throw new Error('Clients must use separate projects');
  const active = new Map();
  let closed = false;
  return Object.freeze({
    clients() { return [...projects].map(([clientId, projectId]) => ({clientId, projectId})); },
    async withPool(context, clientId, role, operation) {
      if (closed) throw new Error('Registry closed');
      // Context MUST be minted by server-side authenticated authorization, never parsed from a request body.
      if (!context || context.trusted !== true || context.clientId !== clientId ||
          typeof context.subject !== 'string' || !context.subject ||
          !['app','migration'].includes(role) ||
          (role === 'migration' && context.canMigrate !== true) ||
          typeof operation !== 'function') throw new Error('Client pool access denied');
      const key = clientId + ':' + role, binding = registry.get(key);
      if (!binding) throw new Error('Client pool access denied');
      let pool = active.get(key);
      if (!pool) {
        pool = await poolFactory(Object.freeze({...binding}));
        if (!pool || typeof pool.connect !== 'function' || typeof pool.end !== 'function') throw new Error('Invalid pool');
        active.set(key, pool);
      }
      return operation(pool, Object.freeze({clientId, projectId: binding.projectId, role}));
    },
    async close() {
      closed = true;
      const pools = [...new Set(active.values())]; active.clear();
      const results = await Promise.allSettled(pools.map(pool => pool.end()));
      if (results.some(result => result.status === 'rejected')) throw new Error('Pool cleanup failed');
    },
  });
}
