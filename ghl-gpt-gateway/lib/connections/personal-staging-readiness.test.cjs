'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SERVICES,SECTIONS,readiness,mayExecute}=require('./personal-staging-readiness.cjs');
test('six requested providers mapped to existing five Connections sections',()=>{
 assert.deepEqual(SERVICES.map(x=>x.id),['neon','google','meta','ai','website','storage']);
 assert.equal(SECTIONS.length,5);
 assert.ok(SERVICES.every(x=>SECTIONS.includes(x.section)));
});
test('unverified account and workspace always fail closed',()=>{
 for(const context of [{},{authenticated:true,owner:true,workspace:'production',gates:{neon:true}},{authenticated:true,owner:false,workspace:'personal-staging',gates:{neon:true}}]){
  assert.ok(readiness(context).every(x=>x.status==='blocked'&&!x.outboundEnabled&&!x.writeEnabled));
 }
});
test('read-only readiness requires per-provider verified gate',()=>{
 const r=readiness({authenticated:true,owner:true,workspace:'personal-staging',gates:{neon:true}});
 assert.equal(r.find(x=>x.id==='neon').status,'ready-for-read-only-test');
 assert.ok(r.filter(x=>x.id!=='neon').every(x=>x.status==='blocked'));
});
test('no outbound, writes, sends or publishing even with approval',()=>{
 const ctx={authenticated:true,owner:true,workspace:'personal-staging',explicitApproval:true};
 assert.equal(mayExecute({kind:'read-only-test'},ctx),true);
 for(const flag of ['external','write','send','publish'])assert.equal(mayExecute({kind:'read-only-test',[flag]:true},ctx),false);
 assert.equal(mayExecute({kind:'read-only-test'},{...ctx,explicitApproval:false}),false);
});
