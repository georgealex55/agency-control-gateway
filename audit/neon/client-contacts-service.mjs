/** Staging-only tenant-scoped CRM contacts read service. No network or schema migration. */
export function createClientContactsService(access, {limitMax=100}={}) {
  if (!access || typeof access.withSession !== 'function' ||
      !Number.isSafeInteger(limitMax) || limitMax < 1 || limitMax > 500)
    throw new TypeError('Invalid contacts dependencies');
  return Object.freeze({
    async list(token, clientId, {limit=25, cursor=0}={}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > limitMax ||
          !Number.isSafeInteger(cursor) || cursor < 0)
        throw new TypeError('Invalid pagination');
      return access.withSession(token, clientId, 'app', async (pool, binding) => {
        if (binding.clientId !== clientId || binding.role !== 'app') throw new Error('Client access denied');
        const conn = await pool.connect();
        try {
          // This schema is staging-only; table creation and PostgreSQL migration remain separate.
          const result = await conn.query({
            text: 'SELECT id, display_name, email FROM reach_contacts ORDER BY id LIMIT $1 OFFSET $2',
            values: [limit, cursor],
            query_timeout: 3000
          });
          if (!Array.isArray(result?.rows)) throw new Error('Invalid contact response');
          const contacts = result.rows.map(row => {
            if (typeof row?.id !== 'string' || typeof row.display_name !== 'string' ||
                !(row.email === null || typeof row.email === 'string'))
              throw new Error('Invalid contact row');
            return Object.freeze({id:row.id,displayName:row.display_name,email:row.email});
          });
          return Object.freeze({clientId,contacts,nextCursor:contacts.length === limit ? cursor+contacts.length : null});
        } finally { conn.release(); }
      });
    }
  });
}
