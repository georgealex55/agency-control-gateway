import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthorizedPoolAccess} from './authorized-pool-access.mjs';
import {createClientPoolRegistry} from './client-pool-registry.mjs';
const bindings=[
 {clientId:'alpha',projectId:'neon_alpha',role:'app',secretRef:'secret:alpha/app'},
 {clientId:'alpha',projectId:'neon_alpha',role:'migration',secretRef:'secret:alpha/migration'},
 {clientId:'bravo',projectId:'neon_bravo',role:'app',secretRef:'secret:bravo/app'}
];
function harness() {
 let grants=[{clientId:'alpha',role:'app'}],session={subject:'person',active:true};
 const calls=[];
 const registry=createClientPoolRegistry(bindings,async binding=>{
   calls.push(binding.clientId+':'+binding.role);
   return {connect(){},async end(){}};
 });
 const access=createAuthorizedPoolAccess({verifySession:async token=>token==='valid'?session:null,
   loadGrants:async()=>grants,registry});
 return {access,calls,registry,setGrants:v=>grants=v,setSession:v=>session=v};
}
test('app role only for authorized tenant, no secret metadata',async()=>{
 const h=harness();
 await h.access.withSession('valid','alpha','app',async(_,metadata)=>{
   assert.equal(metadata.clientId,'alpha');assert.equal(JSON.stringify(metadata).includes('secret:'),false);
 });
 assert.deepEqual(h.calls,['alpha:app']);await h.registry.close();
});
test('rejects cross-tenant and migration privilege escalation before pool creation',async()=>{
 const h=harness();
 await assert.rejects(h.access.withSession('valid','bravo','app',async()=>{}),/denied/);
 await assert.rejects(h.access.withSession('valid','alpha','migration',async()=>{}),/denied/);
 assert.deepEqual(h.calls,[]);await h.registry.close();
});
test('migration role requires fresh explicit trusted grant',async()=>{
 const h=harness();h.setGrants([{clientId:'alpha',role:'migration'}]);
 await h.access.withSession('valid','alpha','migration',async(_,m)=>assert.equal(m.role,'migration'));
 await assert.rejects(h.access.withSession('valid','alpha','app',async()=>{}),/denied/);
 assert.deepEqual(h.calls,['alpha:migration']);await h.registry.close();
});
test('revocation and grant removal take effect on subsequent operations',async()=>{
 const h=harness();await h.access.withSession('valid','alpha','app',async()=>{});
 h.setGrants([]);await assert.rejects(h.access.withSession('valid','alpha','app',async()=>{}),/denied/);
 h.setGrants([{clientId:'alpha',role:'app'}]);h.setSession({subject:'person',active:false});
 await assert.rejects(h.access.withSession('valid','alpha','app',async()=>{}),/denied/);
 assert.deepEqual(h.calls,['alpha:app']);await h.registry.close();
});
test('forged session object and malformed grants fail closed',async()=>{
 const h=harness();
 await assert.rejects(h.access.withSession({subject:'person',trusted:true},'alpha','app',async()=>{}),/denied/);
 h.setGrants([{clientId:'alpha',role:'app'},null]);
 await assert.rejects(h.access.withSession('valid','alpha','app',async()=>{}),/denied/);
 assert.deepEqual(h.calls,[]);await h.registry.close();
});
test('operation failure propagates without granting another role',async()=>{
 const h=harness();await assert.rejects(h.access.withSession('valid','alpha','app',async()=>{throw Error('synthetic failure')}),/synthetic failure/);
 await assert.rejects(h.access.withSession('valid','alpha','migration',async()=>{}),/denied/);
 await h.registry.close();
});
