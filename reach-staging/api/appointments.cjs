'use strict';
// REACH 2.2 STAGING ONLY: synthetic appointments; no external booking, network or provider calls.
// Adapter.transaction MUST pin a single connection and rollback all changes on failure.
const {randomUUID}=require('node:crypto');
const {assertTenantAccess}=require('../security/tenant-policy.cjs');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const error=(status,message)=>({status,body:{source:'STAGING_SYNTHETIC',error:message}});
function createAppointmentApi({sessions,db}={}){
 if(!sessions||typeof sessions.resolve!=='function'||typeof sessions.validCsrf!=='function'||!db||typeof db.transaction!=='function')throw new TypeError('Trusted session and transaction adapter required');
 return Object.freeze({async handle({token,csrf,tenantId,action,contactId,appointmentId,scheduledAt}={}){
  const session=sessions.resolve(token);
  if(!session)return error(401,'Authentication required');
  try{assertTenantAccess({session,tenantId,action:action==='create'?'create':'update'});}catch{return error(403,'Forbidden');}
  if(!sessions.validCsrf(token,csrf))return error(403,'CSRF validation failed');
  if(!['create','reschedule','cancel'].includes(action)||!ID.test(contactId||'')||(action!=='create'&&!ID.test(appointmentId||'')))return error(400,'Invalid appointment request');
  if(action!=='cancel'&&(typeof scheduledAt!=='string'||!UTC.test(scheduledAt)||!Number.isFinite(Date.parse(scheduledAt))||new Date(scheduledAt).toISOString().replace(/\\.000Z$/,'Z')!==scheduledAt.replace(/\\.000Z$/,'Z')))return error(400,'Invalid appointment time');
  try{
   const result=await db.transaction(async tx=>{
    if(!tx||typeof tx.query!=='function')throw Error('BAD_ADAPTER');
    const contact=await tx.query('SELECT id FROM reach22_contacts WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,contactId]);
    if(contact.rows.length!==1)return {notFound:true};
    let id=appointmentId;
    if(action==='create'){
     id=randomUUID();
     await tx.query("INSERT INTO reach22_appointments (tenant_id,id,contact_id,scheduled_at,status) VALUES ($1,$2,$3,$4,'scheduled')",[tenantId,id,contactId,scheduledAt]);
    }else{
     const update=action==='cancel'
      ?await tx.query("UPDATE reach22_appointments SET status='cancelled' WHERE tenant_id=$1 AND id=$2 AND contact_id=$3 AND status='scheduled' RETURNING id",[tenantId,id,contactId])
      :await tx.query("UPDATE reach22_appointments SET scheduled_at=$4 WHERE tenant_id=$1 AND id=$2 AND contact_id=$3 AND status='scheduled' RETURNING id",[tenantId,id,contactId,scheduledAt]);
     if(update.rows.length!==1)return {notFound:true};
    }
    // Timeline events and task completion occur atomically with the appointment.
    const timelineId=randomUUID();
    await tx.query('INSERT INTO reach22_timeline (tenant_id,id,contact_id,appointment_id,event_type,occurred_at) VALUES ($1,$2,$3,$4,$5,now())',[tenantId,timelineId,contactId,id,'appointment_'+action]);
    if(action==='create')await tx.query("UPDATE reach22_tasks SET status='done' WHERE tenant_id=$1 AND contact_id=$2 AND status='open' AND source_call_id IS NOT NULL",[tenantId,contactId]);
    return {id,contactId,action,timelineId};
   });
   if(result.notFound)return error(404,'Contact or active appointment not found');
   return {status:action==='create'?201:200,body:{source:'STAGING_SYNTHETIC',connected:false,...result}};
  }catch{return error(503,'Synthetic staging storage unavailable');}
 }});
}
module.exports={createAppointmentApi};
