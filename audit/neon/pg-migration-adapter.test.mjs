import test from 'node:test';
import assert from 'node:assert/strict';
import { createPgMigrationAdapter } from './pg-migration-adapter.mjs';
import { defineMigration, createClientMigrationCoordinator } from './client-migrations.mjs';
function fakePool({ failSql = '', failCommit = false } = {}) {
  const events = []; let releases = 0;
  const client = { async query(sql, params) {
    events.push({sql, params});
    if (sql === failSql || (failCommit && sql === 'COMMIT')) throw new Error('injected failure');
    if (sql.startsWith('SELECT id, checksum')) return {rows:[]};
    return {rows:[]};
  }, release() {releases++;} };
  return {pool:{async connect(){return client;}}, events, get releases(){return releases;}};
}
test('uses one client, advisory transaction lock, history and atomic commit', async()=>{
  const f=fakePool(); const db=createPgMigrationAdapter(f.pool);
  const coordinator=createClientMigrationCoordinator({withClient:async (_token,id,fn)=>fn(db,id)},[defineMigration('001_init','CREATE TABLE synthetic(id text)')]);
  assert.deepEqual((await coordinator.apply('fake','client_a')).applied,['001_init']);
  const sql=f.events.map(e=>e.sql);
  assert.equal(sql[0],'BEGIN'); assert.equal(sql.at(-1),'COMMIT');
  assert.ok(sql.indexOf('SELECT pg_advisory_xact_lock($1)') < sql.indexOf('CREATE TABLE synthetic(id text)'));
  assert.ok(sql.some(s=>s.startsWith('CREATE TABLE IF NOT EXISTS reach_schema_migrations')));
  assert.deepEqual(f.events.find(e=>e.sql.startsWith('INSERT INTO reach_schema_migrations')).params[0],'001_init');
  assert.equal(f.releases,1);
});
test('rollback and release on migration failure',async()=>{
  const f=fakePool({failSql:'BAD SQL'}); const db=createPgMigrationAdapter(f.pool);
  await assert.rejects(db.transaction(async tx=>{await tx.lockMigrations(); await tx.executeMigration('BAD SQL');}),/injected failure/);
  assert.deepEqual(f.events.slice(-2).map(x=>x.sql),['BAD SQL','ROLLBACK']); assert.equal(f.releases,1);
});
test('commit failure triggers rollback and release',async()=>{
  const f=fakePool({failCommit:true});
  await assert.rejects(createPgMigrationAdapter(f.pool).transaction(async()=>42),/injected failure/);
  assert.deepEqual(f.events.map(x=>x.sql),['BEGIN','COMMIT','ROLLBACK']); assert.equal(f.releases,1);
});
test('invalid records rejected without SQL execution',async()=>{
  const f=fakePool();
  await assert.rejects(createPgMigrationAdapter(f.pool).transaction(tx=>tx.recordMigration('bad','nothex')),/Invalid migration record/);
  assert.deepEqual(f.events.map(x=>x.sql),['BEGIN','ROLLBACK']); assert.equal(f.releases,1);
});
test('failed begin releases client without rollback',async()=>{
  const f=fakePool({failSql:'BEGIN'});
  await assert.rejects(createPgMigrationAdapter(f.pool).transaction(async()=>42),/injected failure/);
  assert.deepEqual(f.events.map(x=>x.sql),['BEGIN']); assert.equal(f.releases,1);
});
