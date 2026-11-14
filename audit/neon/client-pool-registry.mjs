/** Staging-only tenant pool selector; injected factories never resolve secrets here. */
export function createClientPoolRegistry(bindings, poolFactory) {
  if (!Array.isArray(bindings) || !bindings.length || typeof poolFactory !== 'function') throw new TypeError('Bindings and factory required');
  const registry = new Map(), projects = new Map();
  for (const b of bindings) {
    if (!b || typeof b.clientId !== 'string' || !/^[\w-]{3,80}$/.test(b.clientId) ||
        typeof b.projectId !== 'string' || !/^[\w-]{3,120}$/.test(b.projectId) ||
        !['app','migration'].includes(b.role) || typeof b.secretRef !== 'string' ||
        !/^secret:[\w/-]{3,180}$/.test(b.secretRef)) throw new TypeError('Invalid client pool binding');
    const key = b.clientId + ':' + b.role;
    if (registry.has(key)) throw new Error('Duplicate client role');
    if (projects.has(b.clientId) && projects.get(b.clientId) !== b.projectId) throw new Error('Client project mismatch');
    projects.set(b.clientId, b.projectId);
    registry.set(key, Object.freeze({clientId:b.clientId,projectId:b.projectId,role:b.role,secretRef:b.secretRef}));
  }
  if (new Set(projects.values()).size !== projects.size) throw new Error('Clients must use separate projects');
  const active = new Map(), pending = new Map(), operations = new Set();
  let closed = false, closing;
  async function acquire(key, binding) {
    if (active.has(key)) return active.get(key);
    if (pending.has(key)) return pending.get(key);
    const creation = (async () => {
      const pool = await poolFactory(binding);
      if (!pool || typeof pool.connect !== 'function' || typeof pool.end !== 'function') {
        if (pool && typeof pool.end === 'function') await pool.end();
        throw new Error('Invalid pool');
      }
      if (closed) {
        await pool.end();
        throw new Error('Registry closed');
      }
      active.set(key, pool);
      return pool;
    })();
    pending.set(key, creation);
    try { return await creation; }
    finally { pending.delete(key); }
  }
  return Object.freeze({
    clients() { return [...projects].map(([clientId, projectId]) => ({clientId, projectId})); },
    async withPool(context, clientId, role, operation) {
      if (closed) throw new Error('Registry closed');
      // Caller MUST pass a server-minted context; this prototype cannot attest to its provenance.
      if (!context || context.trusted !== true || context.clientId !== clientId ||
          typeof context.subject !== 'string' || !context.subject ||
          !['app','migration'].includes(role) ||
          (role === 'migration' && context.canMigrate !== true) ||
          typeof operation !== 'function') throw new Error('Client pool access denied');
      const key = clientId + ':' + role, binding = registry.get(key);
      if (!binding) throw new Error('Client pool access denied');
      const task = (async () => {
        const pool = await acquire(key, binding);
        if (closed) throw new Error('Registry closed');
        return operation(pool, Object.freeze({clientId, projectId: binding.projectId, role}));
      })();
      operations.add(task);
      try { return await task; }
      finally { operations.delete(task); }
    },
    async close() {
      if (closing) return closing;
      closed = true;
      closing = (async () => {
        // Wait for creation and active operations before ending any pool.
        await Promise.allSettled([...operations, ...pending.values()]);
        const pools = [...new Set(active.values())];
        active.clear();
        const results = await Promise.allSettled(pools.map(pool => pool.end()));
        if (results.some(result => result.status === 'rejected')) throw new Error('Pool cleanup failed');
      })();
      return closing;
    },
  });
}
