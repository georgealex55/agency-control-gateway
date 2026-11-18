'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildBriefing,createDailyBriefing}=require('./daily-briefing.cjs');
const asOf='2026-11-13T12:00:00.000Z';
const row={id:'opp-1',stage:'quoted',source_type:'missed_call',amount_cents:100000,created_at:'2026-11-10T12:00:00.000Z',updated_at:'2026-11-12T12:00:00.000Z',followup_due_at:'2026-11-12T12:00:00.000Z'};
const session=Object.freeze({tenantId:'business-a',userId:'owner-a',role:'owner'});
test('deterministic owner briefing has provenance and approval-only commands',async()=>{
 const api=createDailyBriefing({session,db:{transaction:async fn=>fn({query:async()=>({rows:[row]})})}});
 const a=await api.forOwner('business-a',{asOf}),b=await api.forOwner('business-a',{asOf});
 assert.deepEqual(a,b);assert.equal(a.suggestions.length,1);
 assert.equal(a.suggestions[0].reasonCode,'MISSED_CALL');
 assert.equal(a.suggestions[0].command.approvalRequired,true);
 assert.equal(a.suggestions[0].command.execution,'DISABLED');
 assert.equal(a.dispatched,false);assert.equal(a.modelUsed,false);
 assert.match(a.metricLabel,/not actual revenue/);
});
test('closed opportunities excluded from actions',()=>{
 const r=buildBriefing({source:'STAGING_SYNTHETIC',asOf,entries:[{opportunityId:'closed-1',priority:'closed',priorityScore:0,reasons:['CLOSED_WON']}],totalEstimatedRecoverableCents:0});
 assert.equal(r.counts.open,0);assert.equal(r.suggestions.length,0);assert.match(r.fallback,/No qualifying/);
});
test('cross-tenant access rejected before any query',async()=>{
 let queried=0;const api=createDailyBriefing({session,db:{transaction:async fn=>fn({query:async()=>{queried++;return {rows:[]};}})}});
 await assert.rejects(api.forOwner('business-b',{asOf}),/Forbidden/);assert.equal(queried,0);
});
test('non-owner cannot retrieve owner briefing',async()=>{
 let queried=0;const api=createDailyBriefing({session:Object.freeze({tenantId:'business-a',userId:'staff-1',role:'staff'}),db:{transaction:async fn=>fn({query:async()=>{queried++;return {rows:[]};}})}});
 await assert.rejects(api.forOwner('business-a',{asOf}),/Forbidden/);assert.equal(queried,0);
});
test('invalid data rejected and safe empty fallback retained',()=>{
 assert.throws(()=>buildBriefing({source:'LIVE',entries:[]}),/Invalid/);
 assert.throws(()=>buildBriefing({source:'STAGING_SYNTHETIC',entries:[],totalEstimatedRecoverableCents:0},{maxItems:0}),/Invalid/);
 const r=buildBriefing({source:'STAGING_SYNTHETIC',asOf,entries:[],totalEstimatedRecoverableCents:0});
 assert.equal(r.suggestions.length,0);assert.equal(r.connected,false);
});
