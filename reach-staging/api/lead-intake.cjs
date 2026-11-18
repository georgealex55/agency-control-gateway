'use strict';
// REACH 2.3 STAGING ONLY: transactional synthetic intake. No provider I/O or sends.
const {randomUUID}=require('node:crypto');
const {assertTenantAccess}=require('../security/tenant-policy.cjs');
const {SOURCES}=require('../data/opportunities.cjs');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const PHONE=/^\+[1-9][0-9]{7,14}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function invalid(message){const error=new TypeError(message);error.code='INVALID_INPUT';throw error;}
function createSyntheticLeadIntake({db,session}={}){
 if(!db||typeof db.transaction!=='function')throw new TypeError('Transactional staging adapter required');
 if(!session||!Object.isFrozen(session))throw new TypeError('Trusted frozen session required');
 return Object.freeze({async ingest(tenantId,input={}){
  // Authorize before querying or disclosing whether a source already exists.
  assertTenantAccess({session,tenantId,action:'create'});
  if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).some(key=>!['sourceType','sourceRef','displayName','phone','email','contactId','title'].includes(key)))invalid('Invalid lead input');
  const {sourceType,sourceRef,contactId=null}=input;
  if(!SOURCES.includes(sourceType)||!ID.test(sourceRef||'')||
     (contactId!==null&&!ID.test(contactId)))invalid('Invalid source or contact');
  const phone=input.phone===undefined||input.phone===null?null:input.phone.trim();
  const email=input.email===undefined||input.email===null?null:input.email.trim().toLowerCase();
  if((phone!==null&&!PHONE.test(phone))||(email!==null&&(email.length>254||!EMAIL.test(email)))||
     (input.phone!=null&&typeof input.phone!=='string')||
     (input.email!=null&&typeof input.email!=='string'))invalid('Invalid contact channel');
  if(contactId===null&&!phone&&!email)invalid('Contact reference, phone or email required');
  const displayName=input.displayName===undefined?'Synthetic lead':input.displayName;
  const title=input.title===undefined?'Follow up '+sourceType.replaceAll('_',' '):input.title;
  if(typeof displayName!=='string'||!displayName.trim()||displayName.length>200||
     typeof title!=='string'||!title.trim()||title.length>200)invalid('Invalid lead display fields');
  return db.transaction(async tx=>{
   if(!tx||typeof tx.query!=='function')throw new TypeError('Pinned transaction query adapter required');
   // The unique (tenant_id,source_type,source_ref) key is the concurrency gate.
   // On duplicate do not change contact details, create another opportunity or leak another tenant.
   const leadId=randomUUID();
   const inserted=await tx.query('INSERT INTO reach23_leads (tenant_id,id,source_type,source_ref) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,source_type,source_ref) DO NOTHING RETURNING id',[tenantId,leadId,sourceType,sourceRef]);
   if(!inserted.rows.length){
    const existing=await tx.query('SELECT id,contact_id FROM reach23_leads WHERE tenant_id=$1 AND source_type=$2 AND source_ref=$3',[tenantId,sourceType,sourceRef]);
    if(!existing.rows.length)throw new Error('Staging idempotency conflict unresolved');
    return Object.freeze({source:'STAGING_SYNTHETIC',duplicate:true,leadId:existing.rows[0].id,contactId:existing.rows[0].contact_id});
   }
   let resolved=contactId;
   if(resolved){
    const found=await tx.query('SELECT id FROM reach22_contacts WHERE tenant_id=$1 AND id=$2',[tenantId,resolved]);
    if(!found.rows.length)invalid('Contact not found in business');
   }else{
    const match=await tx.query('SELECT id FROM reach22_contacts WHERE tenant_id=$1 AND (($2::text IS NOT NULL AND phone=$2) OR ($3::text IS NOT NULL AND lower(email)=$3)) ORDER BY id LIMIT 1',[tenantId,phone,email]);
    resolved=match.rows[0]?.id;
    if(!resolved){
     resolved=randomUUID();
     await tx.query('INSERT INTO reach22_contacts (tenant_id,id,display_name,phone,email) VALUES ($1,$2,$3,$4,$5)',[tenantId,resolved,displayName.trim(),phone,email]);
    }
   }
   await tx.query('UPDATE reach23_leads SET contact_id=$3 WHERE tenant_id=$1 AND id=$2',[tenantId,leadId,resolved]);
   const opportunityId=randomUUID();
   await tx.query("INSERT INTO reach23_opportunities (tenant_id,id,lead_id,stage,title) VALUES ($1,$2,$3,'new',$4)",[tenantId,opportunityId,leadId,title.trim()]);
   return Object.freeze({source:'STAGING_SYNTHETIC',duplicate:false,leadId,contactId:resolved,opportunityId,sourceType,sourceRef});
  });
 }});
}
module.exports={createSyntheticLeadIntake};
