import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientPoolRegistry } from './client-pool-registry.mjs';
const bindings = [
 {clientId:'alpha',projectId:'neon_alpha',role:'app',secretRef:'secret:alpha/app'},
 {clientId:'alpha',projectId:'neon_alpha',role:'migration',secretRef:'secret:alpha/migration'},
 {clientId:'bravo',projectId:'neon_bravo',role:'app',secretRef:'secret:bravo/app'}
];
const ctx=(clientId,canMigrate=false)=>({trusted:true,clientId,subject:'synthetic',canMigrate});
test('reuses pools per client and redacts metadata',async()=>{
 let count=0,closed=0;
 const r=createClientPoolRegistry(bindings,async()=>{count++;return {connect(){},async end(){closed++}}});
 const a=await r.withPool(ctx('alpha'),'alpha','app',async(p,m)=>{assert.equal(JSON.stringify(m).includes('secret:'),false);return p});
 const b=await r.withPool(ctx('alpha'),'alpha','app',async p=>p);
 const c=await r.withPool(ctx('bravo'),'bravo','app',async p=>p);
 assert.equal(a,b);assert.notEqual(a,c);assert.equal(count,2);
 await r.close();assert.equal(closed,2);
 await assert.rejects(()=>r.withPool(ctx('alpha'),'alpha','app',async()=>{}),/closed/);
});
test('denies cross-client and untrusted access before factory',async()=>{
 let calls=0;const r=createClientPoolRegistry(bindings,async()=>{calls++;return {connect(){},end(){}}});
 for(const c of [ctx('bravo'),{...ctx('alpha'),trusted:false},null])
  await assert.rejects(()=>r.withPool(c,'alpha','app',async()=>{}),/denied/);
 assert.equal(calls,0);
});
test('migration requires elevated context and dedicated role',async()=>{
 const roles=[];const r=createClientPoolRegistry(bindings,async b=>{roles.push(b.role);return {connect(){},end(){}}});
 await assert.rejects(()=>r.withPool(ctx('alpha'),'alpha','migration',async()=>{}),/denied/);
 await r.withPool(ctx('alpha',true),'alpha','migration',async(_p,m)=>assert.equal(m.role,'migration'));
 assert.deepEqual(roles,['migration']);
});
test('rejects shared project, mismatched project roles, duplicate roles and URL credentials',()=>{
 for(const replacement of [
 {...bindings[2],projectId:'neon_alpha'}, {...bindings[1],projectId:'neon_other'},
 {...bindings[1],role:'app'}, {...bindings[1],secretRef:'postgres://user:pass@host/db'}
 ]) assert.throws(()=>createClientPoolRegistry([bindings[0],replacement],()=>{}));
});
test('rejects malformed pool',async()=>{
 const r=createClientPoolRegistry(bindings,async()=>({connect(){}}));
 await assert.rejects(()=>r.withPool(ctx('alpha'),'alpha','app',async()=>{}),/Invalid pool/);
});
