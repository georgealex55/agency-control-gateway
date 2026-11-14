/** Pure, fail-closed client database binding validation. No connections or secrets are logged. */
export function validateClientNeonBindings(bindings) {
  if (!Array.isArray(bindings) || bindings.length === 0) throw new Error('At least one client binding required');
  const ids = new Set();
  const hosts = new Set();
  return bindings.map((binding) => {
    if (!binding || typeof binding !== 'object') throw new Error('Invalid client binding');
    const { clientId, databaseUrl } = binding;
    if (typeof clientId !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(clientId)) throw new Error('Invalid client ID');
    if (ids.has(clientId)) throw new Error('Duplicate client ID');
    ids.add(clientId);
    let url;
    try { url = new URL(databaseUrl); } catch { throw new Error(`Invalid database URL for ${clientId}`); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error(`Non-Postgres URL for ${clientId}`);
    if (!url.username || !url.password || !url.hostname || !url.pathname || url.pathname === '/') throw new Error(`Incomplete database URL for ${clientId}`);
    if (!url.hostname.endsWith('.neon.tech') || url.hostname === '.neon.tech') throw new Error(`Non-Neon hostname for ${clientId}`);
    if (url.searchParams.get('sslmode') !== 'require' && url.searchParams.get('sslmode') !== 'verify-full') throw new Error(`TLS required for ${clientId}`);
    if (url.hash) throw new Error(`Fragment forbidden for ${clientId}`);
    const endpoint = url.hostname.replace(/-pooler(?=\.)/, '');
    if (hosts.has(endpoint)) throw new Error('Client bindings share a Neon endpoint');
    hosts.add(endpoint);
    const database = decodeURIComponent(url.pathname.slice(1));
    return Object.freeze({ clientId, endpoint, database, tls: true });
  });
}
