'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { passwordHash, verifyPassword, newSessionStore, sessionCookie, clearSessionCookie } = require('./session.cjs');
test('scrypt hashes are salted and passwords are verified without plain-text persistence', () => {
  const a = passwordHash('staging-test-password-1');
  const b = passwordHash('staging-test-password-1');
  assert.notEqual(a,b);
  assert.equal(verifyPassword('staging-test-password-1',a),true);
  assert.equal(verifyPassword('wrong-password-value',a),false);
  assert.equal(verifyPassword('staging-test-password-1','scrypt-v1:broken'),false);
  assert.throws(()=>passwordHash('short'));
});
test('session identity and tenant are immutable copies, expiry and revocation fail closed', () => {
  let time=1000;
  const store=newSessionStore({now:()=>time});
  const issued=store.issue({userId:'synthetic-owner',tenantId:'synthetic-business-a',role:'owner'});
  const resolved=store.resolve(issued.token);
  assert.equal(resolved.tenantId,'synthetic-business-a');
  assert.equal(Object.isFrozen(resolved),true);
  assert.equal(store.resolve('not-a-session'),null);
  assert.throws(()=>store.issue({userId:'x',tenantId:'other',role:'admin'}));
  assert.equal(store.validCsrf(issued.token,issued.csrf),true);
  assert.equal(store.validCsrf(issued.token,'bad'),false);
  time=issued.expiresAt;
  assert.equal(store.resolve(issued.token),null);
  const second=store.issue({userId:'synthetic-owner',tenantId:'synthetic-business-a',role:'owner'});
  assert.equal(store.revoke(second.token),true);
  assert.equal(store.resolve(second.token),null);
});
test('session cookie is host-only, httpOnly, secure and SameSite strict', () => {
  const token=newSessionStore().issue({userId:'demo-owner',tenantId:'demo-tenant',role:'owner'}).token;
  const cookie=sessionCookie(token);
  for(const attribute of ['__Host-', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict']) assert.ok(cookie.includes(attribute));
  assert.equal(cookie.includes('Domain='),false);
  assert.match(clearSessionCookie(),/Max-Age=0/);
  assert.throws(()=>sessionCookie(token,{secure:false}));
});
