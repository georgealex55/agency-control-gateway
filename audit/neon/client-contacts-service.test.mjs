import test from 'node:test';
import assert from 'node:assert/strict';
import {createClientContactsService} from './client-contacts-service.mjs';
import {createAuthorizedPoolAccess} from './authorized-pool-access.mjs';
import {createClientPoolRegistry} from './client-pool-registry.mjs';
function fixture(grants=[{clientId:'alpha',role:'app'}], rows=[{id:'1',display_name:'Synthetic A',email:null}]) {
 const events=[];
 const registry=createClientPoolRegistry([
  {clientId:'alpha',projectId:'project_alpha',role:'app',secretRef:'secret:alpha/app'},
  {clientId:'bravo',projectId:'project_bravo',role:'app',secretRef:'secret:bravo/app'}
 ],async binding=>({async connect(){events.push('connect:'+binding.clientId);return {
  async query(q){events.push(q);return {rows};},release(){events.push('release');}
 };},async end(){events.push('end');}}));
 const access=createAuthorizedPoolAccess({verifySession:async token=>token==='valid'?{subject:'fake',active:true}:null,loadGrants:async()=>grants,registry});
 return {service:createClientContactsService(access),registry,events};
}
test('authorized contact read is parameterized and scoped to client',async()=>{
 const f=fixture();
 assert.deepEqual(await f.service.list('valid','alpha'),{clientId:'alpha',contacts:[{id:'1',displayName:'Synthetic A',email:null}],nextCursor:null});
 assert.deepEqual(f.events[1].values,[25,0]);
 assert.match(f.events[1].text,/LIMIT \\$1 OFFSET \\$2/);
 await f.registry.close();
});
test('cross-client access and invalid sessions never open pools',async()=>{
 const f=fixture();
 await assert.rejects(f.service.list('valid','bravo'));
 await assert.rejects(f.service.list('invalid','alpha'));
 assert.deepEqual(f.events,[]);
 await f.registry.close();
});
test('invalid pagination fails before database access',async()=>{
 const f=fixture();
 await assert.rejects(f.service.list('valid','alpha',{limit:10000}));
 await assert.rejects(f.service.list('valid','alpha',{cursor:-1}));
 assert.deepEqual(f.events,[]);
 await f.registry.close();
});
test('malformed contact rows fail closed and release connection',async()=>{
 const f=fixture(undefined,[{id:3,display_name:'bad',email:null}]);
 await assert.rejects(f.service.list('valid','alpha'));
 assert.deepEqual(f.events,['connect:alpha',f.events[1],'release']);
 await f.registry.close();
});
test('migration-only grant cannot read contacts',async()=>{
 const f=fixture([{clientId:'alpha',role:'migration'}]);
 await assert.rejects(f.service.list('valid','alpha'));
 assert.deepEqual(f.events,[]);
 await f.registry.close();
});
