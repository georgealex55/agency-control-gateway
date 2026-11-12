'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createDashboardSelectors,SQL,ACTIVITY}=require('./dashboard.cjs');
const session=Object.freeze({userId:'owner_1',tenantId:'tenant_A',role:'owner'});
const sessions={resolve:token=>token==='good'?session:null};
function fixture(){const calls=[];const db={async query(sql,args){calls.push({sql,args});if(sql===ACTIVITY)return {rows:[{event_type:'appointment_create',occurred_at:'2026-11-12T00:00:00Z'}]};return {rows:[{value:2}]};}};return {calls,db};}
test('authenticated dashboard reports tenant-filtered metrics and synthetic labels',async()=>{const {calls,db}=fixture();const api=createDashboardSelectors({sessions,db});const out=await api.read({token:'good',tenantId:'tenant_A'});assert.equal(out.status,200);assert.equal(out.body.source,'STAGING_SYNTHETIC');assert.equal(out.body.providerStatus,'DISCONNECTED');assert.deepEqual(Object.keys(out.body.metrics),Object.keys(SQL));assert.equal(out.body.metrics.openCallbacks,2);assert.equal(out.body.activity[0].type,'appointment_create');assert.equal(calls.length,6);assert.ok(calls.every(c=>c.args.length===1&&c.args[0]==='tenant_A'&&c.sql.includes('tenant_id=$1')));});
test('missing session fails closed without querying database',async()=>{const {calls,db}=fixture();const out=await createDashboardSelectors({sessions,db}).read({token:'bad',tenantId:'tenant_A'});assert.equal(out.status,401);assert.equal(calls.length,0);});
test('cross-tenant access fails closed without querying database',async()=>{const {calls,db}=fixture();const out=await createDashboardSelectors({sessions,db}).read({token:'good',tenantId:'tenant_B'});assert.equal(out.status,403);assert.equal(calls.length,0);});
test('storage failures are redacted',async()=>{const db={query:async()=>{throw Error('internal-secret');}};const out=await createDashboardSelectors({sessions,db}).read({token:'good',tenantId:'tenant_A'});assert.equal(out.status,503);assert.doesNotMatch(JSON.stringify(out),/internal-secret/);});
test('invalid aggregate counts fail closed',async()=>{const db={query:async()=>({rows:[{value:'2'}]})};const out=await createDashboardSelectors({sessions,db}).read({token:'good',tenantId:'tenant_A'});assert.equal(out.status,503);});
