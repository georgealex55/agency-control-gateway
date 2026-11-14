import test from 'node:test';
import assert from 'node:assert/strict';
import { defineMigration, createClientMigrationCoordinator } from './client-migrations.mjs';
const migrations = [defineMigration('001_initial', 'CREATE TABLE contacts(id text)'), defineMigration('002_pipeline', 'CREATE TABLE pipelines(id text)')];
function fakeAccess({history = [], denied = false, fail = false, mismatch = false} = {}) {
  const events = [];
  const db = { async transaction(fn) {
    events.push('begin');
    const staged = [...history];
    try {
      const result = await fn({
        async lockMigrations() { events.push('lock'); },
        async getAppliedMigrations() { return staged; },
        async executeMigration(sql) { events.push('execute:' + sql); if (fail) throw new Error('synthetic DB failure'); },
        async recordMigration(id, checksum) { events.push('record:' + id); staged.push({id, checksum}); },
      });
      history.splice(0, history.length, ...staged); events.push('commit'); return result;
    } catch (e) { events.push('rollback'); throw e; }
  }};
  return {events, history, access: {async withClient(token, clientId, fn) {
    if (denied || token !== 'valid' || clientId !== 'client_a') throw new Error('Client access denied');
    return fn(db, mismatch ? 'client_b' : clientId);
  }}};
}
test('applies ordered migrations under transaction lock and is idempotent', async () => {
  const f = fakeAccess(); const c = createClientMigrationCoordinator(f.access, migrations);
  assert.deepEqual((await c.apply('valid', 'client_a')).applied, ['001_initial', '002_pipeline']);
  assert.deepEqual((await c.apply('valid', 'client_a')).applied, []);
  assert.equal(f.history.length, 2); assert.equal(f.events.filter(x=>x==='commit').length, 2);
  assert.ok(f.events.indexOf('lock') < f.events.indexOf('execute:CREATE TABLE contacts(id text)'));
});
test('denies unauthorized tenant before opening transaction', async () => {
  const f = fakeAccess({denied:true});
  await assert.rejects(createClientMigrationCoordinator(f.access, migrations).apply('valid','client_a'), /denied/);
  assert.deepEqual(f.events, []);
});
test('denies mismatched client binding before transaction', async () => {
  const f = fakeAccess({mismatch:true});
  await assert.rejects(createClientMigrationCoordinator(f.access, migrations).apply('valid','client_a'), /mismatch/);
  assert.deepEqual(f.events, []);
});
test('rejects checksum drift, unknown and non-prefix migration history', async () => {
  for (const history of [[{id:'001_initial',checksum:'bad'}], [{id:'002_pipeline',checksum:migrations[1].checksum}], [{id:'unknown',checksum:'abc'}]]) {
    const f=fakeAccess({history});
    await assert.rejects(createClientMigrationCoordinator(f.access,migrations).apply('valid','client_a'), /history/);
    assert.equal(f.events.at(-1),'rollback');
  }
});
test('rolls back records and changes on injected execution failure', async () => {
  const f=fakeAccess({fail:true});
  await assert.rejects(createClientMigrationCoordinator(f.access,migrations).apply('valid','client_a'), /synthetic DB failure/);
  assert.deepEqual(f.history, []); assert.equal(f.events.at(-1),'rollback');
});
test('rejects malformed and duplicate migration definitions', () => {
  assert.throws(()=>defineMigration('..','SELECT 1'), /ID/);
  assert.throws(()=>createClientMigrationCoordinator(fakeAccess().access,[migrations[0],migrations[0]]), /duplicate/);
  assert.throws(()=>createClientMigrationCoordinator(fakeAccess().access,[{...migrations[0],sql:'DROP TABLE contacts'}]), /Invalid/);
});
