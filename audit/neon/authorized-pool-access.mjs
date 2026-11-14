/** Staging-only server-side session-to-pool boundary. No request-provided grants. */
export function createAuthorizedPoolAccess({verifySession, loadGrants, registry}) {
  if (typeof verifySession !== 'function' || typeof loadGrants !== 'function' ||
      !registry || typeof registry.withPool !== 'function') throw new TypeError('Trusted dependencies required');
  return Object.freeze({
    async withSession(sessionToken, clientId, role, operation) {
      const denied = () => new Error('Client pool access denied');
      if (typeof sessionToken !== 'string' || !sessionToken.trim() ||
          typeof clientId !== 'string' || !/^[\w-]{3,80}$/.test(clientId) ||
          !['app','migration'].includes(role) || typeof operation !== 'function') throw denied();
      let session, grants;
      try {
        session = await verifySession(sessionToken);
        if (!session || session.active !== true || session.revoked === true ||
            typeof session.subject !== 'string' || !session.subject.trim()) throw denied();
        grants = await loadGrants(session.subject);
      } catch { throw denied(); }
      if (!Array.isArray(grants) || !grants.every(g => g && typeof g.clientId === 'string' &&
          (g.role === 'app' || g.role === 'migration'))) throw denied();
      if (!grants.some(g => g.clientId === clientId && g.role === role)) throw denied();
      const context = Object.freeze({trusted:true,subject:session.subject,clientId,canMigrate:role === 'migration'});
      return registry.withPool(context, clientId, role, operation);
    },
  });
}
