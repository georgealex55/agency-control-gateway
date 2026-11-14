'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSyntheticLeadIntake}=require('./lead-intake.cjs');
const owner=Object.freeze({tenantId:'business-a',userId:'owner-a',role:'owner'});
function fixture(){
 const leads=new Map(),contacts=new Map(),opportunities=new Map(),calls=[];
 const key=(tenant,type,ref)=>tenant+':'+type+':'+ref;
 const db={transaction:async fn=>fn({query:async(sql,p)=>{
  calls.push({sql,p});
  if(sql.startsWith('INSERT INTO reach23_leads')){
   const k=key(p[0],p[2],p[3]);
   if(leads.has(k))return {rows:[]};
   leads.set(k,{id:p[1],contact_id:null});return {rows:[{id:p[1]}]};
  }
  if(sql.startsWith('SELECT id,contact_id FROM reach23_leads'))return {rows:[leads.get(key(p[0],p[1],p[2]))].filter(Boolean)};
  if(sql.startsWith('SELECT id FROM reach22_contacts')){
   if(sql.includes('AND id=$2'))return {rows:[contacts.get(p[0]+':'+p[1])].filter(Boolean)};
   return {rows:[...contacts.values()].filter(c=>c.tenant===p[0]&&((p[1]&&c.phone===p[1])||(p[2]&&c.email===p[2]))).slice(0,1)};
  }
  if(sql.startsWith('INSERT INTO reach22_contacts')){contacts.set(p[0]+':'+p[1],{id:p[1],tenant:p[0],phone:p[3],email:p[4]});return {rows:[]};}
  if(sql.startsWith('UPDATE reach23_leads')){for(const l of leads.values())if(l.id===p[1])l.contact_id=p[2];return {rows:[]};}
  if(sql.startsWith('INSERT INTO reach23_opportunities')){opportunities.set(p[0]+':'+p[1],p);return {rows:[]};}
  throw Error('Unexpected query: '+sql);
 }} )};
 return {db,calls,leads,contacts,opportunities};
}
test('source attribution and idempotent replay create one lead/contact/opportunity',async()=>{
 const f=fixture(),store=createSyntheticLeadIntake({db:f.db,session:owner});
 const input={sourceType:'form',sourceRef:'form-100',phone:'+15551234567',displayName:'Example',title:'New request'};
 const first=await store.ingest('business-a',input),again=await store.ingest('business-a',input);
 assert.equal(first.duplicate,false);assert.equal(again.duplicate,true);
 assert.equal(first.leadId,again.leadId);assert.equal(first.contactId,again.contactId);
 assert.equal(f.leads.size,1);assert.equal(f.contacts.size,1);assert.equal(f.opportunities.size,1);
 assert.ok(f.calls.every(c=>c.p[0]==='business-a'));
});
test('different source types reuse existing matching contact without merging lead provenance',async()=>{
 const f=fixture(),store=createSyntheticLeadIntake({db:f.db,session:owner});
 const a=await store.ingest('business-a',{sourceType:'inquiry',sourceRef:'chat-1',email:'USER@EXAMPLE.COM'});
 const b=await store.ingest('business-a',{sourceType:'manual',sourceRef:'manual-2',email:'user@example.com'});
 assert.equal(a.contactId,b.contactId);assert.notEqual(a.leadId,b.leadId);
 assert.equal(f.contacts.size,1);assert.equal(f.leads.size,2);assert.equal(f.opportunities.size,2);
});
test('explicit contact must exist within tenant; rollback-capable adapter required',async()=>{
 const f=fixture(),store=createSyntheticLeadIntake({db:f.db,session:owner});
 await assert.rejects(store.ingest('business-a',{sourceType:'manual',sourceRef:'m-1',contactId:'outside'}),/Contact not found/);
 assert.throws(()=>createSyntheticLeadIntake({db:{query:()=>{}},session:owner}),/Transactional/);
});
test('cross-business input denied before any database work',async()=>{
 const f=fixture(),store=createSyntheticLeadIntake({db:f.db,session:owner});
 await assert.rejects(store.ingest('business-b',{sourceType:'form',sourceRef:'form-1',phone:'+15551234567'}),/Forbidden/);
 assert.equal(f.calls.length,0);
});
test('reject unknown fields, invalid sources, missing contact and malformed channels',async()=>{
 const f=fixture(),store=createSyntheticLeadIntake({db:f.db,session:owner});
 for(const input of [
  {sourceType:'form',sourceRef:'form-1',phone:'555'},
  {sourceType:'form',sourceRef:'form-1',email:'not-an-email'},
  {sourceType:'form',sourceRef:'form-1'},
  {sourceType:'unknown',sourceRef:'form-1',phone:'+15551234567'},
  {sourceType:'form',sourceRef:'bad source',phone:'+15551234567'},
  {sourceType:'form',sourceRef:'form-1',phone:'+15551234567',tenantId:'business-b'}
 ])await assert.rejects(store.ingest('business-a',input),TypeError);
 assert.equal(f.calls.length,0);
});
