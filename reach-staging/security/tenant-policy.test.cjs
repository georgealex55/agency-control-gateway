'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertTenantAccess, withTenantRepository } = require('./tenant-policy.cjs');
const { newSessionStore } = require('../auth/session.cjs');
const store = newSessionStore();
const owner = store.resolve(store.issue({userId:'synthetic-owner-a',tenantId:'business-a',role:'owner'}).token);
const other = store.resolve(store.issue({userId:'synthetic-owner-b',tenantId:'business-b',role:'owner'}).token);
function denied(fn) { assert.throws(fn, e => e.code === 'FORBIDDEN' && e.status === 403); }
test('tenant-scoped reads and writes allow only matching authenticated owner', () => {
  for (const action of ['read','create','update','delete']) {
    assert.equal(assertTenantAccess({session:owner,tenantId:'business-a',action}).tenantId,'business-a');
    denied(()=>assertTenantAccess({session:owner,tenantId:'business-b',action}));
    denied(()=>assertTenantAccess({session:other,tenantId:'business-a',action}));
  }
});
test('missing or malformed sessions, roles, actions and resource ownership fail closed', () => {
  for (const session of [null,{}, {...owner,role:'admin'}, {...owner,tenantId:'business-b'}]) {
    denied(()=>assertTenantAccess({session,tenantId:'business-a',action:'read'}));
  }
  for (const action of ['drop','*',undefined]) denied(()=>assertTenantAccess({session:owner,tenantId:'business-a',action}));
  denied(()=>assertTenantAccess({session:owner,tenantId:'business-a',action:'read',resourceTenantId:'business-b'}));
  denied(()=>assertTenantAccess({session:owner,tenantId:'business-a',action:'read',requiredRole:'staff'}));
});
test('repository callback cannot run on cross-tenant request', () => {
  let calls=0;
  denied(()=>withTenantRepository(owner,'business-b','create',()=>{calls++;}));
  denied(()=>withTenantRepository(owner,'business-a','update',()=>{calls++;},{resourceTenantId:'business-b'}));
  assert.equal(calls,0);
  const result=withTenantRepository(owner,'business-a','create',scope=>{calls++; return scope.tenantId;});
  assert.equal(result,'business-a');
  assert.equal(calls,1);
});
test('staff role is read/write-limited and cannot delete or use owner-only operation', () => {
  const staff=Object.freeze({userId:'synthetic-staff',tenantId:'business-a',role:'staff'});
  assert.equal(assertTenantAccess({session:staff,tenantId:'business-a',action:'read'}).role,'staff');
  denied(()=>assertTenantAccess({session:staff,tenantId:'business-a',action:'delete'}));
  denied(()=>assertTenantAccess({session:staff,tenantId:'business-a',action:'update',requiredRole:'owner'}));
});
