/** Staging-only PostgreSQL migration adapter. Inject a trusted, client-specific pg Pool. */
const HISTORY = 'reach_schema_migrations';
const LOCK_KEY = 724391502; // constant advisory lock; scoped to the connected database
export function createPgMigrationAdapter(pool) {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('PostgreSQL pool required');
  return Object.freeze({
    async transaction(work) {
      if (typeof work !== 'function') throw new TypeError('Transaction callback required');
      const client = await pool.connect();
      if (!client || typeof client.query !== 'function' || typeof client.release !== 'function') {
        client?.release?.(); throw new TypeError('Invalid PostgreSQL client');
      }
      let begun = false;
      try {
        await client.query('BEGIN'); begun = true;
        // A role with only DML privileges must not run this adapter. Use a separate migration role.
        const tx = Object.freeze({
          async lockMigrations() {
            await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
            await client.query(`CREATE TABLE IF NOT EXISTS ${HISTORY} (id text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
          },
          async getAppliedMigrations() {
            const result = await client.query(`SELECT id, checksum FROM ${HISTORY} ORDER BY applied_at ASC, id ASC`);
            if (!Array.isArray(result?.rows)) throw new Error('Invalid migration history response');
            return result.rows;
          },
          async executeMigration(sql) {
            if (typeof sql !== 'string' || !sql.trim()) throw new TypeError('Migration SQL required');
            await client.query(sql); // trusted, checksum-validated repository definitions only
          },
          async recordMigration(id, checksum) {
            if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{2,79}$/.test(id) ||
                typeof checksum !== 'string' || !/^[a-f0-9]{64}$/.test(checksum)) throw new TypeError('Invalid migration record');
            await client.query(`INSERT INTO ${HISTORY} (id, checksum) VALUES ($1, $2)`, [id, checksum]);
          },
        });
        const result = await work(tx);
        await client.query('COMMIT'); begun = false;
        return result;
      } catch (error) {
        if (begun) { try { await client.query('ROLLBACK'); } catch (rollbackError) { error.rollbackFailed = true; } }
        throw error;
      } finally { client.release(); }
    },
  });
}
