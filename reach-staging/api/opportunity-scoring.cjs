'use strict';
// REACH 2.3 STAGING ONLY: deterministic, explainable opportunity prioritization.
// Monetary values are illustrative expected opportunity value, never booked revenue.
const {assertTenantAccess}=require('../security/tenant-policy.cjs');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const STAGES=new Set(['new','contacted','quoted','booked','won','lost']);
const SOURCES=new Set(['missed_call','inquiry','form','manual','appointment','reactivation']);
const DEFAULTS=Object.freeze({baseProbabilityBps:2000,missedCallBoostBps:1200,inquiryBoostBps:800,quotedBoostBps:1500,bookedBoostBps:3000,overdueBoostBps:1000,maxProbabilityBps:9000,maxAgeDays:365});
function invalid(){const e=new TypeError('Invalid synthetic opportunity scoring request');e.code='INVALID_INPUT';throw e;}
function validDate(v){return typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;}
function assumptions(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))invalid();
 for(const k of Object.keys(input))if(!Object.hasOwn(DEFAULTS,k))invalid();
 const result={...DEFAULTS,...input};
 for(const [k,v] of Object.entries(result))if(!Number.isSafeInteger(v)||v<0||v>(k==='maxAgeDays'?3650:10000))invalid();
 if(result.maxProbabilityBps>10000)invalid();
 return Object.freeze(result);
}
function scoreOpportunity(row,{asOf,config=DEFAULTS}={}){
 if(!validDate(asOf)||!row||typeof row!=='object'||!ID.test(row.id||'')||!STAGES.has(row.stage)||!SOURCES.has(row.source_type)||!Number.isSafeInteger(row.amount_cents)||row.amount_cents<0||row.amount_cents>Number.MAX_SAFE_INTEGER/10000||!validDate(row.created_at)||!validDate(row.updated_at)||Date.parse(row.created_at)>Date.parse(asOf)||Date.parse(row.updated_at)>Date.parse(asOf))invalid();
 const a=assumptions(config),reasons=[];
 const ageDays=Math.floor((Date.parse(asOf)-Date.parse(row.updated_at))/86400000);
 if(ageDays>a.maxAgeDays)reasons.push('STALE_OPPORTUNITY');
 if(row.stage==='won'||row.stage==='lost')return Object.freeze({opportunityId:row.id,stage:row.stage,priority:'closed',priorityScore:0,probabilityBps:0,estimatedRecoverableCents:0,amountCents:row.amount_cents,reasons:Object.freeze(['CLOSED_'+row.stage.toUpperCase()]),source:'STAGING_SYNTHETIC',dispatched:false});
 let probability=a.baseProbabilityBps;
 if(row.source_type==='missed_call'){probability+=a.missedCallBoostBps;reasons.push('MISSED_CALL');}
 if(row.source_type==='inquiry'){probability+=a.inquiryBoostBps;reasons.push('UNANSWERED_INQUIRY');}
 if(row.stage==='quoted'){probability+=a.quotedBoostBps;reasons.push('QUOTE_PENDING');}
 if(row.stage==='booked'){probability+=a.bookedBoostBps;reasons.push('BOOKING_PENDING');}
 if(row.followup_due_at!==null&&row.followup_due_at!==undefined){
  if(!validDate(row.followup_due_at))invalid();
  if(Date.parse(row.followup_due_at)<=Date.parse(asOf)){probability+=a.overdueBoostBps;reasons.push('FOLLOWUP_DUE');}
 }
 if(ageDays>a.maxAgeDays)probability=0;
 probability=Math.min(a.maxProbabilityBps,probability);
 const estimatedRecoverableCents=Math.round(row.amount_cents*probability/10000);
 const priorityScore=probability===0?0:Math.min(100,Math.round(probability/100)+(reasons.includes('FOLLOWUP_DUE')?10:0));
 return Object.freeze({opportunityId:row.id,stage:row.stage,priority:priorityScore>=65?'high':priorityScore>=35?'medium':'low',priorityScore,probabilityBps:probability,estimatedRecoverableCents,amountCents:row.amount_cents,reasons:Object.freeze(reasons),source:'STAGING_SYNTHETIC',dispatched:false});
}
function createOpportunityScoring({db,session}={}){
 if(!db||typeof db.transaction!=='function'||!session||!Object.isFrozen(session))throw new TypeError('Trusted frozen session and transaction adapter required');
 return Object.freeze({async rank(tenantId,{asOf,config={},limit=50}={}){
  assertTenantAccess({session,tenantId,action:'read'});
  if(!validDate(asOf)||!Number.isInteger(limit)||limit<1||limit>100)invalid();
  const a=assumptions(config);
  return db.transaction(async tx=>{
   if(!tx||typeof tx.query!=='function')throw new TypeError('Pinned transaction adapter required');
   const result=await tx.query(`SELECT o.id,o.stage,l.source_type,o.created_at,o.updated_at,
    COALESCE(e.amount_cents,0)::bigint AS amount_cents,
    f.due_at AS followup_due_at
    FROM reach23_opportunities o
    JOIN reach23_leads l ON l.tenant_id=o.tenant_id AND l.id=o.lead_id
    LEFT JOIN LATERAL (
      SELECT amount_cents,id FROM reach23_estimates
      WHERE tenant_id=o.tenant_id AND opportunity_id=o.id
      ORDER BY revision DESC,id DESC LIMIT 1
    ) e ON true
    LEFT JOIN reach23_estimate_followups f ON f.tenant_id=o.tenant_id AND f.estimate_id=e.id AND f.status='open'
    WHERE o.tenant_id=$1 AND o.created_at<=$2::timestamptz
    ORDER BY o.updated_at DESC,o.id ASC LIMIT $3`,[tenantId,asOf,limit]);
   const entries=result.rows.map(r=>scoreOpportunity({...r,amount_cents:Number(r.amount_cents),created_at:new Date(r.created_at).toISOString(),updated_at:new Date(r.updated_at).toISOString(),followup_due_at:r.followup_due_at?new Date(r.followup_due_at).toISOString():null},{asOf,config:a})).sort((x,y)=>y.priorityScore-x.priorityScore||x.opportunityId.localeCompare(y.opportunityId));
   const totalEstimatedRecoverableCents=entries.reduce((sum,x)=>sum+x.estimatedRecoverableCents,0);
   if(!Number.isSafeInteger(totalEstimatedRecoverableCents))invalid();
   return Object.freeze({source:'STAGING_SYNTHETIC',connected:false,dispatched:false,asOf,assumptions:a,metricLabel:'Illustrative estimated recoverable opportunity value, not actual revenue',totalEstimatedRecoverableCents,entries:Object.freeze(entries)});
  });
 }});
}
module.exports={DEFAULTS,assumptions,scoreOpportunity,createOpportunityScoring};
