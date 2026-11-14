'use strict';
// REACH 2.3 STAGING ONLY: synthetic missed-call / unanswered-inquiry recovery.
// No telephony, email, SMS, provider calls, scheduling or external sends.
const {randomUUID}=require('node:crypto');
const {assertTenantAccess}=require('../security/tenant-policy.cjs');
const ID=/^[A-Za-z0-9_-]{1,60}$/;
const PHONE=/^\+[1-9][0-9]{7,14}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function invalid(){const e=new TypeError('Invalid synthetic recovery event');e.code='INVALID_INPUT';throw e;}
function createSyntheticRecovery({db,session}={}){
 if(!db||typeof db.transaction!=='function')throw new TypeError('Transactional staging adapter required');
 if(!session||!Object.isFrozen(session))throw new TypeError('Trusted frozen session required');
 return Object.freeze({async ingest(tenantId,event={}){
  // Deny before inspecting source records or issuing a query.
  assertTenantAccess({session,tenantId,action:'create'});
  if(!event||typeof event!=='object'||Array.isArray(event)||
     Object.keys(event).some(k=>!['sourceType','sourceRef','phone','email','occurredAt'].includes(k)))invalid();
  const {sourceType,sourceRef,occurredAt}=event;
  if(!['missed_call','inquiry'].includes(sourceType)||typeof sourceRef!=='string'||!ID.test(sourceRef))invalid();
  if(event.phone!=null&&typeof event.phone!=='string'||event.email!=null&&typeof event.email!=='string')invalid();
  const phone=event.phone?.trim()||null;
  const email=event.email?.trim().toLowerCase()||null;
  if((phone&&!PHONE.test(phone))||(email&&(email.length>254||!EMAIL.test(email)))||(!phone&&!email))invalid();
  if(sourceType==='missed_call'&&!phone)invalid();
  if(typeof occurredAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(occurredAt)||
     !Number.isFinite(Date.parse(occurredAt))||new Date(occurredAt).toISOString().replace(/\.000Z$/,'Z')!==occurredAt.replace(/\.000Z$/,'Z'))invalid();
  // Dedicated receipt namespace avoids collisions with the REACH 2.2 missed-call API.
  const receiptKey='recovery_'+sourceType+'_'+sourceRef;
  return db.transaction(async tx=>{
   if(!tx||typeof tx.query!=='function')throw new TypeError('Pinned transaction adapter required');
   const receipt=await tx.query("INSERT INTO reach22_event_receipts (tenant_id,event_key,event_type) VALUES ($1,$2,'synthetic_recovery') ON CONFLICT DO NOTHING RETURNING event_key",[tenantId,receiptKey]);
   if(!receipt.rows.length)return Object.freeze({source:'STAGING_SYNTHETIC',connected:false,duplicate:true,sourceType,sourceRef});
   const leadId=randomUUID();
   const inserted=await tx.query('INSERT INTO reach23_leads (tenant_id,id,source_type,source_ref) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,source_type,source_ref) DO NOTHING RETURNING id',[tenantId,leadId,sourceType,sourceRef]);
   // A preexisting lead from another intake route must not produce a second callback.
   if(!inserted.rows.length)return Object.freeze({source:'STAGING_SYNTHETIC',connected:false,duplicate:true,sourceType,sourceRef});
   const match=await tx.query('SELECT id FROM reach22_contacts WHERE tenant_id=$1 AND (($2::text IS NOT NULL AND phone=$2) OR ($3::text IS NOT NULL AND lower(email)=$3)) ORDER BY id LIMIT 1',[tenantId,phone,email]);
   let contactId=match.rows[0]?.id;
   if(!contactId){
    contactId=randomUUID();
    await tx.query('INSERT INTO reach22_contacts (tenant_id,id,display_name,phone,email) VALUES ($1,$2,$3,$4,$5)',[tenantId,contactId,'Synthetic recovery contact',phone,email]);
   }
   await tx.query('UPDATE reach23_leads SET contact_id=$3 WHERE tenant_id=$1 AND id=$2',[tenantId,leadId,contactId]);
   let callId=null;
   if(sourceType==='missed_call'){
    callId=randomUUID();
    await tx.query("INSERT INTO reach22_calls (tenant_id,id,contact_id,direction,outcome,occurred_at) VALUES ($1,$2,$3,'inbound','missed',$4)",[tenantId,callId,contactId,occurredAt]);
   }
   const taskId=randomUUID(),opportunityId=randomUUID();
   await tx.query("INSERT INTO reach22_tasks (tenant_id,id,contact_id,source_call_id,status,title) VALUES ($1,$2,$3,$4,'open',$5)",[tenantId,taskId,contactId,callId,sourceType==='missed_call'?'Return missed call':'Follow up unanswered inquiry']);
   await tx.query("INSERT INTO reach23_opportunities (tenant_id,id,lead_id,stage,title) VALUES ($1,$2,$3,'new',$4)",[tenantId,opportunityId,leadId,sourceType==='missed_call'?'Missed call recovery':'Unanswered inquiry recovery']);
   return Object.freeze({source:'STAGING_SYNTHETIC',connected:false,duplicate:false,sourceType,sourceRef,contactId,callId,taskId,leadId,opportunityId});
  });
 }});
}
module.exports={createSyntheticRecovery};
