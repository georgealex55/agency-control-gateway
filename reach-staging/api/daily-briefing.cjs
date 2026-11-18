'use strict';
// REACH 2.3 staging-only owner briefing. No AI model, external actions, or credentials.
const {assertTenantAccess}=require('../security/tenant-policy.cjs');
const {createOpportunityScoring}=require('./opportunity-scoring.cjs');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const ACTIONS=Object.freeze({
 MISSED_CALL:'Review missed call and prepare callback',
 UNANSWERED_INQUIRY:'Review unanswered inquiry and prepare reply',
 FOLLOWUP_DUE:'Review overdue follow-up',
 QUOTE_PENDING:'Review pending estimate and prepare follow-up',
 BOOKING_PENDING:'Review pending booking',
 STALE_OPPORTUNITY:'Review stale opportunity'
});
function buildBriefing(ranking,{maxItems=5}={}){
 if(!ranking||ranking.source!=='STAGING_SYNTHETIC'||!Array.isArray(ranking.entries)||!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>25)throw new TypeError('Invalid synthetic briefing');
 const open=ranking.entries.filter(e=>e.priority!=='closed');
 const suggestions=open.filter(e=>e.reasons.some(reason=>ACTIONS[reason])).sort((a,b)=>b.priorityScore-a.priorityScore||a.opportunityId.localeCompare(b.opportunityId)).slice(0,maxItems).map(e=>{
  if(!ID.test(e.opportunityId)||!Array.isArray(e.reasons))throw new TypeError('Invalid opportunity provenance');
  const reason=e.reasons.find(x=>ACTIONS[x]);
  return Object.freeze({opportunityId:e.opportunityId,reasonCode:reason,explanation:ACTIONS[reason],priority:e.priority,estimatedRecoverableCents:e.estimatedRecoverableCents,provenance:Object.freeze({source:'STAGING_SYNTHETIC',opportunityId:e.opportunityId,reasonCodes:Object.freeze([...e.reasons]),asOf:ranking.asOf}),command:Object.freeze({type:'PREPARE_OWNER_REVIEW',opportunityId:e.opportunityId,approvalRequired:true,execution:'DISABLED',dispatched:false})});
 });
 const urgent=open.filter(e=>e.priority==='high').length;
 return Object.freeze({kind:'OWNER_DAILY_BRIEFING',source:'STAGING_SYNTHETIC',connected:false,modelUsed:false,dispatched:false,asOf:ranking.asOf,headline:urgent+' high-priority synthetic opportunities to review',counts:Object.freeze({open:open.length,urgent,suggestions:suggestions.length}),estimatedRecoverableCents:ranking.totalEstimatedRecoverableCents,metricLabel:'Illustrative estimated recoverable opportunity value, not actual revenue',suggestions:Object.freeze(suggestions),fallback:suggestions.length?'Review suggestions before any action':'No qualifying synthetic actions; review the opportunity list manually'});
}
function createDailyBriefing({db,session}={}){
 const scoring=createOpportunityScoring({db,session});
 return Object.freeze({async forOwner(tenantId,{asOf,config={},limit=50,maxItems=5}={}){
  const actor=assertTenantAccess({session,tenantId,action:'read'});
  if(actor.role!=='owner') {const e=new Error('Forbidden');e.code='FORBIDDEN';throw e;}
  const ranking=await scoring.rank(tenantId,{asOf,config,limit});
  return buildBriefing(ranking,{maxItems});
 }});
}
module.exports={ACTIONS,buildBriefing,createDailyBriefing};
