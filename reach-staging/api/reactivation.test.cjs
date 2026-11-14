'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createReactivationPreview,UP,DOWN}=require('./reactivation.cjs');
const session=Object.freeze({tenantId:'business-a',userId:'owner-a',role:'owner'});
const asOf='2026-11-13T12:00:00.000Z';
function fixture(rows){const calls=[];const db={transaction:async fn=>fn({query:async(sql,params)=>{calls.push({sql,params});return {rows};}})};return {api:createReactivationPreview({db,session}),calls};}
test('eligible consented inactive email customer gets preview only',async()=>{
 const f=fixture([{id:'c1',email:'a@example.test',last_activity_at:asOf,reactivation_consent_email:true}]);
 const r=await f.api.preview('business-a',{asOf});
 assert.equal(r.eligibleCount,1);assert.equal(r.entries[0].eligible,true);assert.equal(r.dispatched,false);assert.equal(r.reviewRequired,true);
 assert.deepEqual(f.calls[0].params,['business-a',asOf,90,50]);
});
test('suppression and do-not-contact override consent',async()=>{
 const f=fixture([{id:'c1',email:'a@example.test',reactivation_consent_email:true,do_not_contact:true,suppressed_at:asOf}]);
 const r=await f.api.preview('business-a',{asOf});
 assert.equal(r.eligibleCount,0);assert.deepEqual(r.entries[0].reasons,['DO_NOT_CONTACT','SUPPRESSED']);
 assert.equal(r.entries[0].previewText,null);
});
test('channel-specific consent and address required',async()=>{
 const f=fixture([{id:'c1',email:'a@example.test',reactivation_consent_email:true,reactivation_consent_sms:false,phone:null}]);
 const r=await f.api.preview('business-a',{asOf,channel:'sms'});
 assert.deepEqual(r.entries[0].reasons,['NO_SMS_CONSENT','NO_PHONE_NUMBER']);
});
test('tenant denial and invalid options fail before database access',async()=>{
 const f=fixture([]);
 await assert.rejects(f.api.preview('business-b',{asOf}),/Forbidden/);
 await assert.rejects(f.api.preview('business-a',{asOf,inactiveDays:2}),/Invalid synthetic/);
 await assert.rejects(f.api.preview('business-a',{asOf,limit:500}),/Invalid synthetic/);
 assert.equal(f.calls.length,0);
});
test('SQL tenant filter and reversible definitions retain safe defaults',async()=>{
 const f=fixture([]);await f.api.preview('business-a',{asOf});
 assert.match(f.calls[0].sql,/c.tenant_id=\$1/);
 assert.match(UP,/reactivation_consent_email boolean NOT NULL DEFAULT false/);
 assert.match(UP,/reactivation_consent_sms boolean NOT NULL DEFAULT false/);
 assert.match(DOWN,/DROP COLUMN IF EXISTS reactivation_consent_email/);
});
