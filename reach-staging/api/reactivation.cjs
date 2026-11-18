'use strict';
// REACH 2.3 staging-only reactivation eligibility and preview. No outbound sends.
const {assertTenantAccess}=require('../security/tenant-policy.cjs');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const CHANNELS=new Set(['email','sms']);
function invalid(){const e=new TypeError('Invalid synthetic reactivation request');e.code='INVALID_INPUT';throw e;}
function createReactivationPreview({db,session}={}){
 if(!db||typeof db.transaction!=='function'||!session||!Object.isFrozen(session))throw new TypeError('Trusted session and transactional adapter required');
 return Object.freeze({async preview(tenantId,{asOf,inactiveDays=90,channel='email',limit=50}={}){
  assertTenantAccess({session,tenantId,action:'read'});
  if(typeof asOf!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(asOf)||!Number.isFinite(Date.parse(asOf))||new Date(asOf).toISOString()!==asOf||!Number.isInteger(inactiveDays)||inactiveDays<30||inactiveDays>730||!CHANNELS.has(channel)||!Number.isInteger(limit)||limit<1||limit>100)invalid();
  return db.transaction(async tx=>{
   const rows=await tx.query(`SELECT c.id,c.display_name,c.last_activity_at,c.email,c.phone,
    c.reactivation_consent_email,c.reactivation_consent_sms,c.do_not_contact,c.suppressed_at
    FROM reach22_contacts c WHERE c.tenant_id=$1 AND c.last_activity_at IS NOT NULL
    AND c.last_activity_at <= ($2::timestamptz - ($3::integer * INTERVAL '1 day'))
    ORDER BY c.last_activity_at ASC,c.id ASC LIMIT $4`,[tenantId,asOf,inactiveDays,limit]);
   const entries=rows.rows.map(c=>{
    const reasons=[];
    if(c.do_not_contact===true)reasons.push('DO_NOT_CONTACT');
    if(c.suppressed_at)reasons.push('SUPPRESSED');
    if(channel==='email'&&!c.reactivation_consent_email)reasons.push('NO_EMAIL_CONSENT');
    if(channel==='sms'&&!c.reactivation_consent_sms)reasons.push('NO_SMS_CONSENT');
    if(channel==='email'&&(!c.email||typeof c.email!=='string'))reasons.push('NO_EMAIL_ADDRESS');
    if(channel==='sms'&&(!c.phone||typeof c.phone!=='string'))reasons.push('NO_PHONE_NUMBER');
    return Object.freeze({contactId:c.id,eligible:reasons.length===0,reasons:Object.freeze(reasons),lastActivityAt:c.last_activity_at,previewText:reasons.length===0?'Hello, we would love to hear from you again. Contact us if you need anything.':null});
   });
   return Object.freeze({source:'STAGING_SYNTHETIC',connected:false,dispatched:false,channel,inactiveDays,asOf,reviewRequired:true,eligibleCount:entries.filter(e=>e.eligible).length,entries:Object.freeze(entries)});
  });
 }});
}
const UP=`
ALTER TABLE reach22_contacts ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;
ALTER TABLE reach22_contacts ADD COLUMN IF NOT EXISTS reactivation_consent_email boolean NOT NULL DEFAULT false;
ALTER TABLE reach22_contacts ADD COLUMN IF NOT EXISTS reactivation_consent_sms boolean NOT NULL DEFAULT false;
ALTER TABLE reach22_contacts ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false;
ALTER TABLE reach22_contacts ADD COLUMN IF NOT EXISTS suppressed_at timestamptz;
CREATE INDEX IF NOT EXISTS reach23_reactivation_activity_idx ON reach22_contacts(tenant_id,last_activity_at);
`;
const DOWN=`
DROP INDEX IF EXISTS reach23_reactivation_activity_idx;
ALTER TABLE reach22_contacts DROP COLUMN IF EXISTS suppressed_at;
ALTER TABLE reach22_contacts DROP COLUMN IF EXISTS do_not_contact;
ALTER TABLE reach22_contacts DROP COLUMN IF EXISTS reactivation_consent_sms;
ALTER TABLE reach22_contacts DROP COLUMN IF EXISTS reactivation_consent_email;
ALTER TABLE reach22_contacts DROP COLUMN IF EXISTS last_activity_at;
`;
module.exports={UP,DOWN,createReactivationPreview};
