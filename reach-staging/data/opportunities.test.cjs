'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {UP,DOWN,TABLES,STAGES,createOpportunityStore}=require('./opportunities.cjs');
const owner=Object.freeze({tenantId:'business-a',userId:'owner-a',role:'owner'});
test('reversible migration uses tenant composite keys, scoped references and indexes',()=>{
 for(const table of TABLES){assert.ok(UP.includes('CREATE TABLE IF NOT EXISTS '+table));assert.ok(DOWN.includes('DROP TABLE IF EXISTS '+table));}
 assert.equal((UP.match(/PRIMARY KEY \(tenant_id,id\)/g)||[]).length,3);
 assert.equal((UP.match(/FOREIGN KEY \(tenant_id,/g)||[]).length,3);
 assert.match(UP,/UNIQUE \(tenant_id,source_type,source_ref\)/);
 assert.match(UP,/UNIQUE \(tenant_id,lead_id\)/);
 assert.deepEqual(STAGES,['new','contacted','quoted','booked','won','lost']);
});
test('authorized fixed SQL always filters by tenant and parameterizes values',async()=>{
 const calls=[];const store=createOpportunityStore({query:async(sql,params)=>{calls.push({sql,params});return {rows:[]}}},owner);
 await store.createLead('business-a',{id:'lead-1',sourceType:'missed_call',sourceRef:'call-1'});
 await store.create('business-a',{id:'opp-1',leadId:'lead-1',title:'Call back'});
 await store.get('business-a','opp-1');await store.history('business-a','opp-1');await store.list('business-a');
 assert.equal(calls.length,5);
 assert.ok(calls.every(c=>c.params[0]==='business-a'&&c.sql.includes('tenant_id')));
 assert.deepEqual(calls[0].params,['business-a','lead-1',null,'missed_call','call-1']);
 assert.deepEqual(calls[1].params,['business-a','opp-1','lead-1','Call back']);
 assert.deepEqual(calls[2].params,['business-a','opp-1']);
 assert.ok(calls.every(c=>!c.sql.includes('Call back')));
});
test('cross-tenant reads and writes fail closed without database calls',()=>{
 const calls=[];const store=createOpportunityStore({query:(...args)=>calls.push(args)},owner);
 assert.throws(()=>store.list('business-b'),/Forbidden/);
 assert.throws(()=>store.get('business-b','opp-1'),/Forbidden/);
 assert.throws(()=>store.createLead('business-b',{id:'lead-1',sourceType:'form',sourceRef:'form-1'}),/Forbidden/);
 assert.throws(()=>store.create('business-b',{id:'opp-1',leadId:'lead-1',title:'Sample'}),/Forbidden/);
 assert.throws(()=>store.history('business-b','opp-1'),/Forbidden/);
 assert.equal(calls.length,0);
});
test('invalid input and untrusted sessions are rejected',()=>{
 const db={query:async()=>({rows:[]})};
 assert.throws(()=>createOpportunityStore(db,{...owner}),/Trusted frozen session/);
 const store=createOpportunityStore(db,owner);
 assert.throws(()=>store.createLead('business-a',{id:'x',sourceType:'unknown',sourceRef:'s'}),/Invalid lead/);
 assert.throws(()=>store.createLead('business-a',{id:'x',sourceType:'form',sourceRef:'bad ref'}),/Invalid lead/);
 assert.throws(()=>store.create('business-a',{id:'o',leadId:'l',title:' '}),/Invalid opportunity/);
 assert.throws(()=>store.get('business-a','bad id'),/Invalid opportunity ID/);
});
test('staff cannot bypass tenant access or delete through repository',()=>{
 const staff=Object.freeze({tenantId:'business-a',userId:'staff-a',role:'staff'});
 const store=createOpportunityStore({query:async()=>({rows:[]})},staff);
 assert.throws(()=>store.list('business-b'),/Forbidden/);
 assert.equal(typeof store.delete, 'undefined');
});
