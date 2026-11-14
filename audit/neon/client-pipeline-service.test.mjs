import test from 'node:test';
import assert from 'node:assert/strict';
import {createClientPipelineService} from './client-pipeline-service.mjs';
function fixture(allowed=true,rows=[]) {
 const calls=[];let released=0;
 const access={async withSession(token,clientId,role,operation){
  if (!allowed || token!=='synthetic' || clientId!=='alpha' || role!=='app') throw new Error('Denied');
  return operation({async connect(){return {async query(q){calls.push(q);return {rows};},release(){released++;}};}},{clientId:'alpha',role:'app'});
 }};
 return {service:createClientPipelineService(access),calls,get released(){return released;}};
}
test('list scopes by pipeline and binds limit',async()=>{
 const f=fixture(true,[{id:'deal1',pipeline_id:'sales',stage_id:'lead',title:'Synthetic deal'}]);
 const r=await f.service.list('synthetic','alpha','sales',{limit:10});
 assert.equal(r.opportunities[0].title,'Synthetic deal');
 assert.deepEqual(f.calls[0].values,['sales',10]);assert.equal(f.released,1);
});
test('unauthorized tenant cannot open connection',async()=>{
 const f=fixture();await assert.rejects(f.service.list('synthetic','bravo','sales'));
 assert.equal(f.calls.length,0);assert.equal(f.released,0);
});
test('stage movement requires same-pipeline stage via SQL predicate',async()=>{
 const f=fixture(true,[{id:'deal1',pipeline_id:'sales',stage_id:'won',title:'Synthetic deal'}]);
 const r=await f.service.move('synthetic','alpha',{opportunityId:'deal1',pipelineId:'sales',stageId:'won'});
 assert.equal(r.updated,true);assert.match(f.calls[0].text,/EXISTS/);
 assert.deepEqual(f.calls[0].values,['deal1','sales','won']);assert.equal(f.released,1);
});
test('missing or forbidden stage returns unchanged',async()=>{
 const f=fixture();assert.deepEqual(await f.service.move('synthetic','alpha',{opportunityId:'deal1',pipelineId:'sales',stageId:'foreign'}),{updated:false});
});
test('invalid identifiers and pagination fail before access',async()=>{
 const f=fixture();await assert.rejects(f.service.list('synthetic','alpha','sales;DROP'));
 await assert.rejects(f.service.list('synthetic','alpha','sales',{limit:101}));
 await assert.rejects(f.service.move('synthetic','alpha',{opportunityId:'',pipelineId:'sales',stageId:'won'}));
 assert.equal(f.calls.length,0);
});
test('malformed row fails closed and releases connection',async()=>{
 const f=fixture(true,[{id:3,pipeline_id:'sales',stage_id:'lead',title:'bad'}]);
 await assert.rejects(f.service.list('synthetic','alpha','sales'));assert.equal(f.released,1);
});
