import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthorizedClientAccess} from './authorized-client-access.mjs';
import {createClientRouter} from './client-router.mjs';

const bindings = [
  {clientId:'client_a',databaseUrl:'postgresql://owner:secret_a@ep-a.us-east-1.aws.neon.tech/app?sslmode=require'},
  {clientId:'client_b',databaseUrl:'postgresql://owner:secret_b@ep-b.us-east-1.aws.neon.tech/app?sslmode=require'},
];
function harness() {
  const calls=[];
  let grants=['client_a'];
  let session={subject:'user-1',active:true};
  const router=createClientRouter(bindings,async (_,id)=>{
    calls.push('open:'+id);
    return {close:async()=>calls.push('close:'+id)};
  });
  const access=createAuthorizedClientAccess({
    verifySession:async token=>token==='valid'?session:null,
    loadGrants:async()=>grants,
    router,
  });
  return {access,calls,setGrants:v=>grants=v,setSession:v=>session=v};
}
test('verified session and fresh grants permit only own tenant and close',async()=>{
  const h=harness();
  assert.equal(await h.access.withSession('valid','client_a',async (_,id)=>id),'client_a');
  assert.deepEqual(h.calls,['open:client_a','close:client_a']);
});
test('forged request grants cannot select other client',async()=>{
  const h=harness();
  await assert.rejects(h.access.withSession({subject:'user-1',allowedClientIds:['client_b']},'client_b',async()=>{}),/denied/);
  await assert.rejects(h.access.withSession('valid','client_b',async()=>{}),/denied/);
  assert.deepEqual(h.calls,[]);
});
test('revocation and changed grants take effect on next request',async()=>{
  const h=harness();
  await h.access.withSession('valid','client_a',async()=>{});
  h.setGrants([]);
  await assert.rejects(h.access.withSession('valid','client_a',async()=>{}),/denied/);
  h.setGrants(['client_a']);
  h.setSession({subject:'user-1',active:false});
  await assert.rejects(h.access.withSession('valid','client_a',async()=>{}),/denied/);
  assert.deepEqual(h.calls,['open:client_a','close:client_a']);
});
test('invalid session and failed grant lookup fail closed',async()=>{
  const h=harness();
  await assert.rejects(h.access.withSession('invalid','client_a',async()=>{}),/denied/);
  h.setGrants(null);
  await assert.rejects(h.access.withSession('valid','client_a',async()=>{}),/denied/);
  assert.deepEqual(h.calls,[]);
});
test('operation failure still closes connection',async()=>{
  const h=harness();
  await assert.rejects(h.access.withSession('valid','client_a',async()=>{throw Error('synthetic')}),/synthetic/);
  assert.deepEqual(h.calls,['open:client_a','close:client_a']);
});
