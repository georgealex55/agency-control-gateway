'use strict';
// REACH 2.3 staging: synthetic estimates and internal follow-up queue. No outbound dispatch.
const {randomUUID}=require('node:crypto');
const {assertTenantAccess}=require('../security/tenant-policy.cjs');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const UP=`
CREATE TABLE IF NOT EXISTS reach23_estimates (
 tenant_id text NOT NULL, id text NOT NULL, opportunity_id text NOT NULL,
 revision integer NOT NULL CHECK (revision > 0), amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
 currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
 note text NOT NULL DEFAULT '', actor_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,opportunity_id,revision),
 FOREIGN KEY (tenant_id,opportunity_id) REFERENCES reach23_opportunities(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS reach23_estimate_followups (
 tenant_id text NOT NULL, id text NOT NULL, estimate_id text NOT NULL,
 opportunity_id text NOT NULL, due_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','cancelled')),
 actor_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,estimate_id),
 FOREIGN KEY (tenant_id,estimate_id) REFERENCES reach23_estimates(tenant_id,id),
 FOREIGN KEY (tenant_id,opportunity_id) REFERENCES reach23_opportunities(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS reach23_followups_due_idx ON reach23_estimate_followups(tenant_id,status,due_at);
`;
const DOWN='DROP TABLE IF EXISTS reach23_estimate_followups;\nDROP TABLE IF EXISTS reach23_estimates;';
function invalid(message){const e=new TypeError(message);e.code='INVALID_INPUT';throw e;}
function createSyntheticEstimates({db,session}={}){
 if(!db||typeof db.transaction!=='function')throw new TypeError('Transactional staging adapter required');
 if(!session||!Object.isFrozen(session))throw new TypeError('Trusted frozen session required');
 return Object.freeze({
  async revise(tenantId,{opportunityId,amountCents,currency='USD',note='',followUpAt}={}){
   const actor=assertTenantAccess({session,tenantId,action:'create'});
   if(typeof opportunityId!=='string'||!ID.test(opportunityId)||
      !Number.isSafeInteger(amountCents)||amountCents<0||
      typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency)||
      typeof note!=='string'||note.length>2000||
      typeof followUpAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(followUpAt)||
      !Number.isFinite(Date.parse(followUpAt))||new Date(followUpAt).toISOString()!==new Date(Date.parse(followUpAt)).toISOString())invalid('Invalid synthetic estimate');
   return db.transaction(async tx=>{
    if(!tx||typeof tx.query!=='function')throw new TypeError('Pinned transaction adapter required');
    const opp=await tx.query('SELECT id,stage FROM reach23_opportunities WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,opportunityId]);
    if(!opp.rows.length){const e=new Error('Opportunity not found');e.code='NOT_FOUND';throw e;}
    if(['won','lost'].includes(opp.rows[0].stage))invalid('Closed opportunity cannot be quoted');
    const prior=await tx.query('SELECT COALESCE(MAX(revision),0) AS revision FROM reach23_estimates WHERE tenant_id=$1 AND opportunity_id=$2',[tenantId,opportunityId]);
    const revision=Number(prior.rows[0]?.revision||0)+1;
    const estimateId=randomUUID(),followUpId=randomUUID();
    await tx.query('INSERT INTO reach23_estimates (tenant_id,id,opportunity_id,revision,amount_cents,currency,note,actor_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[tenantId,estimateId,opportunityId,revision,amountCents,currency,note,actor.userId]);
    await tx.query('INSERT INTO reach23_estimate_followups (tenant_id,id,estimate_id,opportunity_id,due_at,actor_id) VALUES ($1,$2,$3,$4,$5,$6)',[tenantId,followUpId,estimateId,opportunityId,followUpAt,actor.userId]);
    // A new revision supersedes the old follow-up; it does not send or schedule external messages.
    await tx.query("UPDATE reach23_estimate_followups SET status='cancelled' WHERE tenant_id=$1 AND opportunity_id=$2 AND estimate_id<>$3 AND status='open'",[tenantId,opportunityId,estimateId]);
    return Object.freeze({source:'STAGING_SYNTHETIC',connected:false,dispatched:false,opportunityId,estimateId,followUpId,revision,amountCents,currency,followUpAt});
   });
  },
  due(tenantId,asOf){
   assertTenantAccess({session,tenantId,action:'read'});
   if(typeof asOf!=='string'||!Number.isFinite(Date.parse(asOf)))invalid('Invalid as-of timestamp');
   return db.transaction(tx=>tx.query("SELECT id,estimate_id,opportunity_id,due_at FROM reach23_estimate_followups WHERE tenant_id=$1 AND status='open' AND due_at<=$2::timestamptz ORDER BY due_at,id",[tenantId,asOf]));
  }
 });
}
module.exports={UP,DOWN,createSyntheticEstimates};
