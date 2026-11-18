import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientPoolRegistry } from './client-pool-registry.mjs';
const bindings = [
 {clientId:'alpha',projectId:'neon_alpha',role:'app',secretRef:'secret:alpha/app'},
 {clientId:'alpha',projectId:'neon_alpha',role:'migration',secretRef:'secret:alpha/migration'},
 {clientId:'bravo',projectId:'neon_bravo',role:'app',secretRef:'secret:bravo/app'}
];
const ctx=(clientId,canMigrate=false)=>({trusted:true,clientId,subject:'synthetic',canMigrate});
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
test('reuses pools per client and redacts metadata',async()=>{
 let count=0,ended=0;
 const r=createClientPoolRegistry(bindings,async()=>{count++;return {connect(){},async end(){ended++}}});
 const a=await r.withPool(ctx('alpha'),'alpha','app',async(p,m)=>{assert.equal(JSON.stringify(m).includes('secret:'),false);return p});
 const b=await r.withPool(ctx('alpha'),'alpha','app',async p=>p);
 const c=await r.withPool(ctx('bravo'),'bravo','app',async p=>p);
 assert.equal(a,b);assert.notEqual(a,c);assert.equal(count,2);
 await r.close();assert.equal(ended,2);
 await assert.rejects(()=>r.withPool(ctx('alpha'),'alpha','app',async()=>{}),/closed/);
});
test('denies cross-client and untrusted access before factory',async()=>{
 let calls=0;const r=createClientPoolRegistry(bindings,async()=>{calls++;return {connect(){},end(){}}});
 for(const c of [ctx('bravo'),{...ctx('alpha'),trusted:false},null])
  await assert.rejects(()=>r.withPool(c,'alpha','app',async()=>{}),/denied/);
 assert.equal(calls,0);await r.close();
});
test('migration requires elevated context and dedicated role',async()=>{
 const roles=[];const r=createClientPoolRegistry(bindings,async b=>{roles.push(b.role);return {connect(){},end(){}}});
 await assert.rejects(()=>r.withPool(ctx('alpha'),'alpha','migration',async()=>{}),/denied/);
 await r.withPool(ctx('alpha',true),'alpha','migration',async(_p,m)=>assert.equal(m.role,'migration'));
 assert.deepEqual(roles,['migration']);await r.close();
});
test('rejects shared project, mismatched project roles, duplicate roles and URL credentials',()=>{
 for(const replacement of [
 {...bindings[2],projectId:'neon_alpha'}, {...bindings[1],projectId:'neon_other'},
 {...bindings[1],role:'app'}, {...bindings[1],secretRef:'postgres://user:pass@host/db'}
 ]) assert.throws(()=>createClientPoolRegistry([bindings[0],replacement],()=>{}));
});
test('rejects malformed pool and closes it when possible',async()=>{
 let ended=0;
 const r=createClientPoolRegistry(bindings,async()=>({async end(){ended++}}));
 await assert.rejects(()=>r.withPool(ctx('alpha'),'alpha','app',async()=>{}),/Invalid pool/);
 assert.equal(ended,1);await r.close();
});
test('single-flight: concurrent requests initialize one pool',async()=>{
 const gate=defer();let made=0,ended=0;
 const r=createClientPoolRegistry(bindings,async()=>{made++;await gate.promise;return {connect(){},async end(){ended++}}});
 const jobs=Array.from({length:20},()=>r.withPool(ctx('alpha'),'alpha','app',async p=>p));
 gate.resolve();const pools=await Promise.all(jobs);
 assert.equal(made,1);assert.ok(pools.every(p=>p===pools[0]));
 await r.close();assert.equal(ended,1);
});
test('failed initialization is retriable, never cached',async()=>{
 let calls=0;
 const r=createClientPoolRegistry(bindings,async()=>{if(++calls===1)throw Error('factory failure');return {connect(){},end(){}}});
 await assert.rejects(()=>r.withPool(ctx('alpha'),'alpha','app',async()=>{}),/factory failure/);
 await r.withPool(ctx('alpha'),'alpha','app',async()=>{});
 assert.equal(calls,2);await r.close();
});
test('close waits for active operation and ends pool once',async()=>{
 const gate=defer(),started=defer();let ended=0;
 const r=createClientPoolRegistry(bindings,async()=>({connect(){},async end(){ended++}}));
 const task=r.withPool(ctx('alpha'),'alpha','app',async()=>{started.resolve();await gate.promise;assert.equal(ended,0)});
 await started.promise;
 const close1=r.close(),close2=r.close();
 await assert.rejects(()=>r.withPool(ctx('alpha'),'alpha','app',async()=>{}),/closed/);
 gate.resolve();await Promise.all([task,close1,close2]);assert.equal(ended,1);
});
test('close during initialization disposes late pool without running operation',async()=>{
 const gate=defer(),started=defer();let ended=0,executed=0;
 const r=createClientPoolRegistry(bindings,async()=>{started.resolve();await gate.promise;return {connect(){},async end(){ended++}}});
 const task=r.withPool(ctx('alpha'),'alpha','app',async()=>{executed++});
 await started.promise;const closing=r.close();gate.resolve();
 await assert.rejects(task,/closed/);await closing;
 assert.equal(executed,0);assert.equal(ended,1);
});
