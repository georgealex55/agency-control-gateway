import test from 'node:test';
import assert from 'node:assert/strict';
import {createClientReadinessService} from './client-readiness-service.mjs';
import {createAuthorizedPoolAccess} from './authorized-pool-access.mjs';
import {createClientPoolRegistry} from './client-pool-registry.mjs';
function fixture({query,grants=[{clientId:'alpha',role:'app'}]}={}) {
 const events=[];
 const registry=createClientPoolRegistry([
  {clientId:'alpha',projectId:'project_alpha',role:'app',secretRef:'secret:alpha/app'},
  {clientId:'alpha',projectId:'project_alpha',role:'migration',secretRef:'secret:alpha/migration'},
  {clientId:'bravo',projectId:'project_bravo',role:'app',secretRef:'secret:bravo/app'}
 ],async binding=>{
  events.push('pool:'+binding.clientId+':'+binding.role);
  return {async connect(){events.push('connect');return {
   async query(q){events.push(q);return query ? query(q) : {rows:[{reach_health:1}]};},
   release(){events.push('release');}
  };},async end(){events.push('end');}};
 });
 const access=createAuthorizedPoolAccess({
  verifySession:async token=>token==='valid'?{subject:'synthetic',active:true}:null,
  loadGrants:async()=>grants,registry
 });
 return {service:createClientReadinessService(access),registry,events};
}
test('authorized app probe executes bounded read-only SQL and releases',async()=>{
 const h=fixture();
 assert.deepEqual(await h.service.check('valid','alpha'),{clientId:'alpha',status:'healthy'});
 assert.deepEqual(h.events.slice(0,4),['pool:alpha:app','connect',
  {text:'SELECT 1 AS reach_health',values:[],query_timeout:3000},'release']);
 await h.registry.close();
});
test('cross-client and invalid sessions denied before pool creation',async()=>{
 const h=fixture();
 assert.equal((await h.service.check('valid','bravo')).status,'unavailable');
 assert.equal((await h.service.check('invalid','alpha')).status,'unavailable');
 assert.deepEqual(h.events,[]);await h.registry.close();
});
test('migration-only grants cannot probe app role',async()=>{
 const h=fixture({grants:[{clientId:'alpha',role:'migration'}]});
 assert.equal((await h.service.check('valid','alpha')).status,'unavailable');
 assert.deepEqual(h.events,[]);await h.registry.close();
});
test('database errors are redacted and connections released',async()=>{
 const h=fixture({query:async()=>{throw Error('postgres://secret@host');}});
 assert.deepEqual(await h.service.check('valid','alpha'),{clientId:'alpha',status:'unavailable'});
 assert.equal(h.events.at(-1),'release');await h.registry.close();
});
test('malformed query responses fail closed',async()=>{
 const h=fixture({query:async()=>({rows:[{reach_health:'1'}]})});
 assert.equal((await h.service.check('valid','alpha')).status,'unavailable');
 await h.registry.close();
});
test('invalid dependencies and timeout fail immediately',()=>{
 assert.throws(()=>createClientReadinessService(null));
 assert.throws(()=>createClientReadinessService({withSession(){}},{timeoutMs:0}));
});
