'use strict';
// REACH 2.3 staging-only: owner-approved simulation, no external dispatch.
const {randomUUID,timingSafeEqual}=require('node:crypto');
const {assertTenantAccess}=require('../security/tenant-policy.cjs');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const KINDS=Object.freeze(['callback','task','booking']);
function invalid(message){const e=new TypeError(message);e.code='INVALID_INPUT';throw e;}
function forbidden(){const e=new Error('Forbidden');e.code='FORBIDDEN';throw e;}
function stale(){const e=new Error('Stale or consumed approval');e.code='STALE_APPROVAL';throw e;}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function createApprovedActions({session,csrfToken,opportunities,clock=()=>new Date(),ttlMs=300000}={}){
 if(!session||!Object.isFrozen(session)||typeof csrfToken!=='string'||csrfToken.length<16||!opportunities||typeof opportunities.get!=='function'||typeof clock!=='function'||!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>3600000)invalid('Trusted staging dependencies required');
 const pending=new Map(),receipts=new Map();
 function owner(tenantId,action,csrf){const actor=assertTenantAccess({session,tenantId,action,requiredRole:'owner'});if(!equal(csrf,csrfToken))forbidden();return actor;}
 async function load(tenantId,opportunityId){if(!ID.test(opportunityId||''))invalid('Invalid opportunity ID');const o=await opportunities.get(tenantId,opportunityId);if(!o||o.tenantId!==tenantId)forbidden();if(!Number.isSafeInteger(o.version)||o.version<0)invalid('Missing opportunity version');if(['won','lost'].includes(o.stage))stale();return o;}
 return Object.freeze({
  async review(tenantId,{opportunityId,kind,csrf}={}){
   const actor=owner(tenantId,'read',csrf);
   if(!KINDS.includes(kind))invalid('Unknown simulated action');
   const opportunity=await load(tenantId,opportunityId),now=clock().getTime();
   if(!Number.isFinite(now))invalid('Invalid clock');
   const reviewId=randomUUID();
   pending.set(reviewId,{tenantId,actorId:actor.userId,opportunityId,kind,version:opportunity.version,expiresAt:now+ttlMs});
   return Object.freeze({reviewId,opportunityId,kind,source:'STAGING_SYNTHETIC',approvalRequired:true,expiresAt:new Date(now+ttlMs).toISOString(),dispatched:false,connected:false,summary:'Owner review required before recording a simulated '+kind});
  },
  async approve(tenantId,{reviewId,csrf}={}){
   const actor=owner(tenantId,'update',csrf);
   if(!ID.test(reviewId||''))invalid('Invalid review ID');
   const item=pending.get(reviewId);
   if(!item||item.tenantId!==tenantId||item.actorId!==actor.userId)stale();
   pending.delete(reviewId); // consume before await; no duplicate approval
   if(clock().getTime()>=item.expiresAt)stale();
   const opportunity=await load(tenantId,item.opportunityId);
   if(opportunity.version!==item.version)stale();
   const receipt=Object.freeze({id:randomUUID(),reviewId,tenantId,opportunityId:item.opportunityId,kind:item.kind,status:'SIMULATED_ONLY',actorId:actor.userId,source:'STAGING_SYNTHETIC',dispatched:false,connected:false,createdAt:clock().toISOString()});
   receipts.set(receipt.id,receipt);return receipt;
  },
  listReceipts(tenantId,{csrf}={}){owner(tenantId,'read',csrf);return Object.freeze([...receipts.values()].filter(r=>r.tenantId===tenantId));}
 });
}
module.exports={KINDS,createApprovedActions};
