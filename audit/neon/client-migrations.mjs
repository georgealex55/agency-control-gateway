/** Staging-only migration coordinator. All DB and authorization operations are injected. */
import { createHash } from 'node:crypto';
const MIGRATION_ID = /^[a-z0-9][a-z0-9_-]{2,79}$/;
export function defineMigration(id, sql) {
  if (typeof id !== 'string' || !MIGRATION_ID.test(id)) throw new Error('Invalid migration ID');
  if (typeof sql !== 'string' || !sql.trim()) throw new Error('Invalid migration SQL');
  return Object.freeze({ id, sql, checksum: createHash('sha256').update(sql).digest('hex') });
}
export function createClientMigrationCoordinator(authorizedAccess, migrationDefinitions) {
  if (!authorizedAccess || typeof authorizedAccess.withClient !== 'function') throw new TypeError('Authorized client access required');
  if (!Array.isArray(migrationDefinitions)) throw new TypeError('Migration definitions required');
  const ids = new Set();
  const migrations = migrationDefinitions.map((m) => {
    if (!m || !MIGRATION_ID.test(m.id) || typeof m.sql !== 'string' ||
        createHash('sha256').update(m.sql).digest('hex') !== m.checksum || ids.has(m.id)) {
      throw new Error('Invalid or duplicate migration definition');
    }
    ids.add(m.id);
    return Object.freeze({ id: m.id, sql: m.sql, checksum: m.checksum });
  });
  return Object.freeze({
    async apply(sessionToken, clientId) {
      return authorizedAccess.withClient(sessionToken, clientId, async (db, authorizedClientId) => {
        if (authorizedClientId !== clientId) throw new Error('Client binding mismatch');
        if (!db || typeof db.transaction !== 'function') throw new Error('Transactional migration adapter required');
        return db.transaction(async (tx) => {
          if (!tx || typeof tx.lockMigrations !== 'function' || typeof tx.getAppliedMigrations !== 'function' ||
              typeof tx.executeMigration !== 'function' || typeof tx.recordMigration !== 'function') {
            throw new Error('Incomplete migration transaction adapter');
          }
          // Lock MUST be scoped to this client's DB and held through transaction commit.
          await tx.lockMigrations();
          const applied = await tx.getAppliedMigrations();
          if (!Array.isArray(applied)) throw new Error('Invalid migration history');
          const history = new Map();
          for (const row of applied) {
            if (!row || typeof row.id !== 'string' || typeof row.checksum !== 'string' || history.has(row.id)) {
              throw new Error('Invalid migration history');
            }
            history.set(row.id, row.checksum);
          }
          // Reject drift, unknown historical migrations and out-of-order execution.
          if (history.size > migrations.length) throw new Error('Unknown migration history');
          for (let i = 0; i < history.size; i++) {
            if (!history.has(migrations[i].id) || history.get(migrations[i].id) !== migrations[i].checksum) {
              throw new Error('Migration history drift or ordering violation');
            }
          }
          const completed = [];
          for (const migration of migrations.slice(history.size)) {
            await tx.executeMigration(migration.sql);
            await tx.recordMigration(migration.id, migration.checksum);
            completed.push(migration.id);
          }
          return Object.freeze({ clientId: authorizedClientId, applied: completed, total: migrations.length });
        });
      });
    },
  });
}
