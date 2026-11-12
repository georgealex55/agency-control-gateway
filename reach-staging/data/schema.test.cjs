'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {UP,DOWN,TABLES,createTenantStore}=require('./schema.cjs');
const owner=Object.freeze({tenantId:'tenant-a',userId:'owner-a',role:'owner'});
test('schema contains tenant-composite keys and tenant-scoped references',()=>{
 for(const table of TABLES)assert.match(UP,new RegExp('CREATE TABLE IF NOT EXISTS '+table));
 assert.equal((UP.match(/PRIMARY KEY \(tenant_id,(?:id|event_key)\)/g)||[]).length,5);
 assert.equal((UP.match(/FOREIGN KEY \(tenant_id,/g)||[]).length,4);
 for(const table of [...TABLES].reverse())assert.ok(DOWN.includes('DROP TABLE IF EXISTS '+table));
});
test('tenant store injects authorized tenant and parameterized contact lookup',async()=>{
 const calls=[];const db={query:async(sql,params)=>{calls.push({sql,params});return {rows:[]}}};
 const store=createTenantStore(db,owner);
 await store.getContact('tenant-a','contact-1');
 assert.deepEqual(calls[0].params,['tenant-a','contact-1']);
 assert.match(calls[0].sql,/tenant_id=\$1 AND id=\$2/);
});
test('cross-tenant and unauthorized mutations never reach database',async()=>{
 const calls=[];const db={query:async(...args)=>{calls.push(args)}};
 const store=createTenantStore(db,owner);
 assert.throws(()=>store.listContacts('tenant-b'),/Forbidden/);
 assert.throws(()=>store.createContact('tenant-b',{id:'c1',displayName:'Sample'}),/Forbidden/);
 assert.equal(calls.length,0);
});
test('invalid identifiers and missing trusted session fail closed',()=>{
 const db={query:async()=>({rows:[]})};
 assert.throws(()=>createTenantStore(db,{...owner}),/Trusted frozen session/);
 const store=createTenantStore(db,owner);
 assert.throws(()=>store.getContact('tenant-a','bad id'),/Invalid contact ID/);
 assert.throws(()=>store.createContact('tenant-a',{id:'c1',displayName:' '}),/Invalid contact/);
});
