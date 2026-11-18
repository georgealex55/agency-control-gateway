import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientRouter } from './client-router.mjs';
const bindings = [
  {clientId:'client_a',databaseUrl:'postgresql://owner:alpha_secret@ep-a.us-east-1.aws.neon.tech/app?sslmode=require'},
  {clientId:'client_b',databaseUrl:'postgresql://owner:beta_secret@ep-b.us-east-1.aws.neon.tech/app?sslmode=require'},
];
const actor = {subject:'user-1',allowedClientIds:['client_a']};
test('routes authorized tenant only and closes connection', async () => {
  const seen=[];
  const router=createClientRouter(bindings,async (url,id)=>{seen.push([id,url]);return {close:async()=>seen.push(['closed',id])}});
  assert.equal(await router.withClient(actor,'client_a',async (_,id)=>id),'client_a');
  assert.equal(seen.length,2); assert.equal(seen[0][0],'client_a');assert.equal(seen[1][0],'closed');
  assert.equal(JSON.stringify(router.clients()).includes('secret'),false);
});
test('cross-client, missing, and malformed principals are denied before factory', async () => {
  let calls=0;
  const router=createClientRouter(bindings,async()=>{calls++;return {close:async()=>{}}});
  for(const [principal,id] of [[actor,'client_b'],[actor,'missing'],[null,'client_a'],[{subject:'x',allowedClientIds:'client_a'},'client_a']]) {
    await assert.rejects(router.withClient(principal,id,async()=>{}),/denied/);
  }
  assert.equal(calls,0);
});
test('closes connection after operation failure',async()=>{
  let closed=0;
  const router=createClientRouter(bindings,async()=>({close:async()=>{closed++}}));
  await assert.rejects(router.withClient(actor,'client_a',async()=>{throw new Error('synthetic failure')}),/synthetic failure/);
  assert.equal(closed,1);
});
test('rejects unsafe configuration and invalid factory',()=>{
  assert.throws(()=>createClientRouter([bindings[0],bindings[0]],async()=>({close(){}})),/Duplicate/);
  assert.throws(()=>createClientRouter(bindings,null),/factory/);
});
