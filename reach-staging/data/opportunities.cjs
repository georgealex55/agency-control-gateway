'use strict';
// REACH 2.3 STAGING ONLY. Definition is never applied automatically.
const {withTenantRepository}=require('../security/tenant-policy.cjs');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const STAGES=Object.freeze(['new','contacted','quoted','booked','won','lost']);
const SOURCES=Object.freeze(['missed_call','inquiry','form','manual','appointment','reactivation']);
const UP=`
CREATE TABLE IF NOT EXISTS reach23_leads (
 tenant_id text NOT NULL, id text NOT NULL, contact_id text,
 source_type text NOT NULL CHECK (source_type IN ('missed_call','inquiry','form','manual','appointment','reactivation')),
 source_ref text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,source_type,source_ref),
 FOREIGN KEY (tenant_id,contact_id) REFERENCES reach22_contacts(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS reach23_opportunities (
 tenant_id text NOT NULL, id text NOT NULL, lead_id text NOT NULL,
 stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','quoted','booked','won','lost')),
 title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,lead_id),
 FOREIGN KEY (tenant_id,lead_id) REFERENCES reach23_leads(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS reach23_stage_events (
 tenant_id text NOT NULL, id text NOT NULL, opportunity_id text NOT NULL,
 previous_stage text CHECK (previous_stage IN ('new','contacted','quoted','booked','won','lost')),
 next_stage text NOT NULL CHECK (next_stage IN ('new','contacted','quoted','booked','won','lost')),
 actor_id text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,id),
 FOREIGN KEY (tenant_id,opportunity_id) REFERENCES reach23_opportunities(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS reach23_opportunities_stage_idx ON reach23_opportunities(tenant_id,stage,updated_at DESC);
CREATE INDEX IF NOT EXISTS reach23_stage_events_history_idx ON reach23_stage_events(tenant_id,opportunity_id,occurred_at DESC);
`;
const DOWN=`
DROP TABLE IF EXISTS reach23_stage_events;
DROP TABLE IF EXISTS reach23_opportunities;
DROP TABLE IF EXISTS reach23_leads;
`;
const TABLES=Object.freeze(['reach23_leads','reach23_opportunities','reach23_stage_events']);
function validId(v){return typeof v==='string'&&ID.test(v);}
function createOpportunityStore(db,session){
 if(!db||typeof db.query!=='function')throw new TypeError('Injected database adapter required');
 if(!session||!Object.isFrozen(session))throw new TypeError('Trusted frozen session required');
 const run=(tenantId,action,sql,params=[])=>withTenantRepository(session,tenantId,action,scope=>db.query(sql,[scope.tenantId,...params]));
 return Object.freeze({
  list(tenantId){return run(tenantId,'read','SELECT id,lead_id,stage,title FROM reach23_opportunities WHERE tenant_id=$1 ORDER BY updated_at DESC,id');},
  get(tenantId,id){if(!validId(id))throw new TypeError('Invalid opportunity ID');return run(tenantId,'read','SELECT id,lead_id,stage,title FROM reach23_opportunities WHERE tenant_id=$1 AND id=$2',[id]);},
  createLead(tenantId,{id,contactId=null,sourceType,sourceRef}={}){
   if(!validId(id)||(contactId!==null&&!validId(contactId))||!SOURCES.includes(sourceType)||!validId(sourceRef))throw new TypeError('Invalid lead');
   return run(tenantId,'create','INSERT INTO reach23_leads (tenant_id,id,contact_id,source_type,source_ref) VALUES ($1,$2,$3,$4,$5) RETURNING id,contact_id,source_type,source_ref',[id,contactId,sourceType,sourceRef]);
  },
  create(tenantId,{id,leadId,title}={}){
   if(!validId(id)||!validId(leadId)||typeof title!=='string'||!title.trim()||title.length>200)throw new TypeError('Invalid opportunity');
   return run(tenantId,'create',"INSERT INTO reach23_opportunities (tenant_id,id,lead_id,stage,title) VALUES ($1,$2,$3,'new',$4) RETURNING id,lead_id,stage,title",[id,leadId,title.trim()]);
  },
  history(tenantId,opportunityId){if(!validId(opportunityId))throw new TypeError('Invalid opportunity ID');return run(tenantId,'read','SELECT id,previous_stage,next_stage,actor_id,occurred_at FROM reach23_stage_events WHERE tenant_id=$1 AND opportunity_id=$2 ORDER BY occurred_at DESC,id',[opportunityId]);}
 });
}
module.exports={UP,DOWN,TABLES,STAGES,SOURCES,createOpportunityStore};
