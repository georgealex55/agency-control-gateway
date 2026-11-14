import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientHealthProbe } from './client-health.mjs';

test('authorized health check issues only a read-only parameterized query', async () => {
  const calls = [];
  const access = { withClient: async (_token, id, fn) => fn({ query: async (...args) => {
    calls.push(args); return { rows: [{ reach_health: 1 }] };
  } }, id) };
  assert.deepEqual(await createClientHealthProbe(access).check('fake-token', 'client-a'), { clientId: 'client-a', status: 'healthy' });
  assert.deepEqual(calls, [['SELECT 1 AS reach_health', [], { readOnly: true, timeoutMs: 5000 }]]);
});
test('authorization denial never invokes a query', async () => {
  const access = { withClient: async () => { throw new Error('Client access denied'); } };
  await assert.rejects(createClientHealthProbe(access).check('fake', 'client-b'), /denied/);
});
test('client identity mismatch fails closed before query', async () => {
  let queried = false;
  const access = { withClient: async (_token, _id, fn) => fn({ query: () => { queried = true; } }, 'client-b') };
  await assert.rejects(createClientHealthProbe(access).check('fake', 'client-a'), /binding mismatch/);
  assert.equal(queried, false);
});
test('invalid result and unavailable adapter fail closed', async () => {
  for (const db of [{}, { query: async () => ({ rows: [] }) }, { query: async () => ({ rows: [{ reach_health: 0 }] }) }]) {
    const access = { withClient: async (_token, id, fn) => fn(db, id) };
    await assert.rejects(createClientHealthProbe(access).check('fake', 'client-a'));
  }
});
test('timeouts are bounded and passed to the adapter, not simulated with Promise.race', async () => {
  assert.throws(() => createClientHealthProbe({ withClient() {} }, { timeoutMs: 0 }), /timeout/);
  assert.throws(() => createClientHealthProbe({ withClient() {} }, { timeoutMs: 30001 }), /timeout/);
  let received;
  const access = { withClient: async (_token, id, fn) => fn({ query: async (_sql, _args, opts) => {
    received = opts; throw new Error('synthetic driver timeout');
  } }, id) };
  await assert.rejects(createClientHealthProbe(access, { timeoutMs: 250 }).check('fake', 'client-a'), /timeout/);
  assert.equal(received.timeoutMs, 250);
});
