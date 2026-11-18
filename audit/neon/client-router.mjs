/** Staging-only tenant-scoped connection selector. No network connection is created here. */
import { validateClientNeonBindings } from './client-neon-config.mjs';

export function createClientRouter(bindings, connectionFactory) {
  if (typeof connectionFactory !== 'function') throw new TypeError('Connection factory required');
  const metadata = validateClientNeonBindings(bindings);
  const registry = new Map(bindings.map((binding, i) => [metadata[i].clientId, {
    databaseUrl: binding.databaseUrl, metadata: metadata[i],
  }]));
  return Object.freeze({
    clients() { return metadata.map(({clientId, endpoint, database, tls}) => ({clientId, endpoint, database, tls})); },
    async withClient(principal, requestedClientId, operation) {
      if (!principal || typeof principal !== 'object' || !Array.isArray(principal.allowedClientIds) ||
          typeof principal.subject !== 'string' || !principal.subject ||
          typeof requestedClientId !== 'string' || !registry.has(requestedClientId) ||
          !principal.allowedClientIds.includes(requestedClientId)) throw new Error('Client access denied');
      if (typeof operation !== 'function') throw new TypeError('Operation required');
      const selected = registry.get(requestedClientId);
      // Credentials are passed only to a trusted server-side factory.
      const connection = await connectionFactory(selected.databaseUrl, requestedClientId);
      if (!connection || typeof connection.close !== 'function') throw new Error('Invalid connection factory result');
      try { return await operation(connection, requestedClientId); }
      finally { await connection.close(); }
    },
  });
}
