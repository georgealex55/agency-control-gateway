/** Staging-only authorization boundary: caller never supplies tenant grants. */
export function createAuthorizedClientAccess({ verifySession, loadGrants, router }) {
  if (typeof verifySession !== 'function' || typeof loadGrants !== 'function' ||
      !router || typeof router.withClient !== 'function') throw new TypeError('Trusted auth dependencies required');
  return Object.freeze({
    async withSession(sessionToken, requestedClientId, operation) {
      if (typeof sessionToken !== 'string' || !sessionToken.trim() ||
          typeof requestedClientId !== 'string' || !requestedClientId ||
          typeof operation !== 'function') throw new Error('Client access denied');
      // Session verification and grant loading MUST be trusted server-side implementations.
      // Never accept grants or subject from request JSON, headers, or user-provided objects.
      let session;
      try { session = await verifySession(sessionToken); }
      catch { throw new Error('Client access denied'); }
      if (!session || typeof session.subject !== 'string' || !session.subject.trim() ||
          session.revoked === true || session.active !== true) throw new Error('Client access denied');
      let grants;
      try { grants = await loadGrants(session.subject); }
      catch { throw new Error('Client access denied'); }
      if (!Array.isArray(grants) || !grants.every(id => typeof id === 'string') ||
          !grants.includes(requestedClientId)) throw new Error('Client access denied');
      // Only the server-generated principal is forwarded. Re-checking occurs on every call.
      return router.withClient({subject: session.subject, allowedClientIds: grants}, requestedClientId, operation);
    },
  });
}
