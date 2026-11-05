import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClientNeonBindings } from './client-neon-config.mjs';
const url = (host) => `postgresql://owner:secret@${host}/app?sslmode=require`;
test('accepts distinct isolated Neon endpoints without leaking credentials', () => {
  const result = validateClientNeonBindings([{ clientId:'client_a', databaseUrl:url('ep-one.us-east-1.aws.neon.tech') }, { clientId:'client_b', databaseUrl:url('ep-two.us-east-1.aws.neon.tech') }]);
  assert.equal(result.length, 2); assert.equal(JSON.stringify(result).includes('secret'), false);
});
test('rejects shared endpoint including pooler alias', () => {
  assert.throws(() => validateClientNeonBindings([{clientId:'client_a',databaseUrl:url('ep-one.us-east-1.aws.neon.tech')},{clientId:'client_b',databaseUrl:url('ep-one-pooler.us-east-1.aws.neon.tech')}]), /share/);
});
test('rejects unsafe connection variants', () => {
  for (const bad of ['sqlite:///tmp/a', 'postgresql://u:p@evil.test/db?sslmode=require', url('ep-one.us-east-1.aws.neon.tech').replace('sslmode=require','sslmode=disable'), 'postgresql://u@ep-one.us-east-1.aws.neon.tech/db?sslmode=require']) {
    assert.throws(() => validateClientNeonBindings([{clientId:'client_a',databaseUrl:bad}]));
  }
});
test('rejects duplicate client and missing config', () => {
  assert.throws(() => validateClientNeonBindings([]));
  assert.throws(() => validateClientNeonBindings([{clientId:'client_a',databaseUrl:url('ep-one.us-east-1.aws.neon.tech')},{clientId:'client_a',databaseUrl:url('ep-two.us-east-1.aws.neon.tech')}]));
});
