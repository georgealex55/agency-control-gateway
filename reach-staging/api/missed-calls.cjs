'use strict';
// REACH 2.2 STAGING ONLY. Synthetic missed-call ingestion; no telephony or network I/O.
// The injected adapter MUST provide a transaction with one pinned connection.
const {randomUUID}=require('node:crypto');
const {assertTenantAccess}=require('../security/tenant-policy.cjs');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const PHONE=/^\+[1-9][0-9]{7,14}$/;
function fail(code){const e=new Error(code);e.code=code;throw e;}
function createMissedCallIngestor({sessions,db}={}){
 if(!sessions||typeof sessions.resolve!=='function'||typeof sessions.validCsrf!=='function'||!db||typeof db.transaction!=='function')throw new TypeError('Trusted sessions and transactional adapter required');
 return Object.freeze({async ingest({token,csrf,tenantId,eventKey,phone,occurredAt}={}){
  const session=sessions.resolve(token);
  if(!session)return {status:401,body:{error:'Authentication required'}};
  try{assertTenantAccess({session,tenantId,action:'create'});}catch{return {status:403,body:{error:'Forbidden'}};}
  if(!sessions.validCsrf(token,csrf))return {status:403,body:{error:'CSRF validation failed'}};
  if(!ID.test(eventKey||'')||!PHONE.test(phone||'')||typeof occurredAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(occurredAt)||!Number.isFinite(Date.parse(occurredAt))||new Date(occurredAt).toISOString()!==new Date(Date.parse(occurredAt)).toISOString()&& !/\.\d+Z$/.test(occurredAt))
   return {status:400,body:{error:'Invalid synthetic call'}};
  try{
   const result=await db.transaction(async tx=>{
    if(!tx||typeof tx.query!=='function')fail('BAD_ADAPTER');
    // Receipt insertion is the concurrency gate. A conflict is a replay, never a second task.
    const receipt=await tx.query("INSERT INTO reach22_event_receipts (tenant_id,event_key,event_type) VALUES ($1,$2,'synthetic_missed_call') ON CONFLICT DO NOTHING RETURNING event_key",[tenantId,eventKey]);
    if(receipt.rows.length===0)return {duplicate:true};
    let match=await tx.query('SELECT id FROM reach22_contacts WHERE tenant_id=$1 AND phone=$2 ORDER BY id LIMIT 1',[tenantId,phone]);
    let contactId=match.rows[0]?.id;
    if(!contactId){
     contactId=randomUUID();
     await tx.query('INSERT INTO reach22_contacts (tenant_id,id,display_name,phone) VALUES ($1,$2,$3,$4)',[tenantId,contactId,'Synthetic caller',phone]);
    }
    const callId=randomUUID(),taskId=randomUUID();
    await tx.query("INSERT INTO reach22_calls (tenant_id,id,contact_id,direction,outcome,occurred_at) VALUES ($1,$2,$3,'inbound','missed',$4)",[tenantId,callId,contactId,occurredAt]);
    await tx.query("INSERT INTO reach22_tasks (tenant_id,id,contact_id,source_call_id,status,title) VALUES ($1,$2,$3,$4,'open','Return missed call')",[tenantId,taskId,contactId,callId]);
    return {duplicate:false,contactId,callId,taskId};
   });
   return {status:result.duplicate?200:201,body:{source:'STAGING_SYNTHETIC',connected:false,...result}};
  }catch{return {status:503,body:{error:'Synthetic staging storage unavailable'}};}
 }});
}
module.exports={createMissedCallIngestor};
