'use strict';
// REACH 2.2 STAGING ONLY. Read-only synthetic dashboard selectors.
// The injected query adapter must be connected only to an explicitly authorized staging fixture.
const {assertTenantAccess}=require('../security/tenant-policy.cjs');
const SQL=Object.freeze({
 contacts:'SELECT count(*)::int AS value FROM reach22_contacts WHERE tenant_id=$1',
 missedCalls:"SELECT count(*)::int AS value FROM reach22_calls WHERE tenant_id=$1 AND outcome='missed'",
 openCallbacks:"SELECT count(*)::int AS value FROM reach22_tasks WHERE tenant_id=$1 AND status='open' AND source_call_id IS NOT NULL",
 appointments:"SELECT count(*)::int AS value FROM reach22_appointments WHERE tenant_id=$1 AND status='scheduled'",
 completedCallbacks:"SELECT count(*)::int AS value FROM reach22_tasks WHERE tenant_id=$1 AND status='done' AND source_call_id IS NOT NULL"
});
const ACTIVITY="SELECT event_type, occurred_at FROM reach22_timeline WHERE tenant_id=$1 ORDER BY occurred_at DESC, id DESC LIMIT 10";
function createDashboardSelectors({sessions,db}={}){
 if(!sessions||typeof sessions.resolve!=='function'||!db||typeof db.query!=='function')throw new TypeError('Trusted sessions and read-only query adapter required');
 return Object.freeze({async read({token,tenantId}={}){
  const session=sessions.resolve(token);
  if(!session)return {status:401,body:{source:'STAGING_SYNTHETIC',error:'Authentication required'}};
  try{assertTenantAccess({session,tenantId,action:'read'});}catch{return {status:403,body:{source:'STAGING_SYNTHETIC',error:'Forbidden'}};}
  try{
   // All queries are fixed, parameterized and tenant-filtered; no user SQL or tenant override.
   const entries=await Promise.all(Object.entries(SQL).map(async ([key,sql])=>{
    const result=await db.query(sql,[tenantId]);
    const value=result?.rows?.[0]?.value;
    if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid count');
    return [key,value];
   }));
   const events=await db.query(ACTIVITY,[tenantId]);
   if(!Array.isArray(events?.rows))throw Error('Invalid activity');
   const activity=events.rows.map(row=>{
    if(!['appointment_create','appointment_reschedule','appointment_cancel'].includes(row.event_type))throw Error('Invalid event');
    const date=new Date(row.occurred_at);
    if(!Number.isFinite(date.getTime()))throw Error('Invalid timestamp');
    return {type:row.event_type,at:date.toISOString()};
   });
   return {status:200,body:{source:'STAGING_SYNTHETIC',connected:false,providerStatus:'DISCONNECTED',metrics:Object.fromEntries(entries),activity}};
  }catch{return {status:503,body:{source:'STAGING_SYNTHETIC',error:'Synthetic staging storage unavailable'}};}
 }});
}
module.exports={createDashboardSelectors,SQL,ACTIVITY};
