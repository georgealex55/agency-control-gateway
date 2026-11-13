'use strict';
// REACH 2.3 STAGING ONLY: synthetic opportunity pipeline. No external dispatch.
const {randomUUID}=require('node:crypto');
const {assertTenantAccess}=require('../security/tenant-policy.cjs');
const {STAGES}=require('../data/opportunities.cjs');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const NEXT=Object.freeze({
 new:['contacted','lost'], contacted:['quoted','booked','lost'],
 quoted:['contacted','booked','won','lost'], booked:['contacted','won','lost'],
 won:[],lost:['contacted']
});
const OWNERSHIP_UP='ALTER TABLE reach23_opportunities ADD COLUMN IF NOT EXISTS owner_user_id text;';
const OWNERSHIP_DOWN='ALTER TABLE reach23_opportunities DROP COLUMN IF EXISTS owner_user_id;';
function invalid(message){const e=new TypeError(message);e.code='INVALID_INPUT';throw e;}
function createSyntheticPipeline({db,session}={}){
 if(!db||typeof db.transaction!=='function')throw new TypeError('Transactional staging adapter required');
 if(!session||!Object.isFrozen(session))throw new TypeError('Trusted frozen session required');
 async function mutate(tenantId,opportunityId,action,change){
  const actor=assertTenantAccess({session,tenantId,action:'update'});
  if(!ID.test(opportunityId||''))invalid('Invalid opportunity ID');
  return db.transaction(async tx=>{
   if(!tx||typeof tx.query!=='function')throw new TypeError('Pinned transaction adapter required');
   const found=await tx.query('SELECT id,stage,owner_user_id FROM reach23_opportunities WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,opportunityId]);
   const current=found.rows[0];
   if(!current){const e=new Error('Opportunity not found');e.code='NOT_FOUND';throw e;}
   if(action==='stage'){
    const stage=change.stage;
    if(!STAGES.includes(stage))invalid('Invalid pipeline stage');
    if(stage===current.stage)return Object.freeze({duplicate:true,stage,opportunityId});
    if(!NEXT[current.stage]?.includes(stage))invalid('Invalid stage transition');
    await tx.query('UPDATE reach23_opportunities SET stage=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,opportunityId,stage]);
    await tx.query('INSERT INTO reach23_stage_events (tenant_id,id,opportunity_id,previous_stage,next_stage,actor_id) VALUES ($1,$2,$3,$4,$5,$6)',[tenantId,randomUUID(),opportunityId,current.stage,stage,actor.userId]);
    return Object.freeze({duplicate:false,opportunityId,previousStage:current.stage,stage,actorId:actor.userId,source:'STAGING_SYNTHETIC'});
   }
   if(action==='owner'){
    if(actor.role!=='owner'){const e=new Error('Forbidden');e.code='FORBIDDEN';throw e;}
    const userId=change.userId;
    if(!ID.test(userId||''))invalid('Invalid owner ID');
    // Membership must be verified from the same tenant, not caller-supplied role data.
    const member=await tx.query('SELECT user_id FROM reach22_users WHERE tenant_id=$1 AND user_id=$2',[tenantId,userId]);
    if(!member.rows.length){const e=new Error('Owner not found in business');e.code='NOT_FOUND';throw e;}
    if(current.owner_user_id===userId)return Object.freeze({duplicate:true,opportunityId,ownerUserId:userId});
    await tx.query('UPDATE reach23_opportunities SET owner_user_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[tenantId,opportunityId,userId]);
    return Object.freeze({duplicate:false,opportunityId,ownerUserId:userId,source:'STAGING_SYNTHETIC'});
   }
   invalid('Unknown mutation');
  });
 }
 return Object.freeze({
  transition(tenantId,opportunityId,stage){return mutate(tenantId,opportunityId,'stage',{stage});},
  assignOwner(tenantId,opportunityId,userId){return mutate(tenantId,opportunityId,'owner',{userId});},
  history(tenantId,opportunityId){
   assertTenantAccess({session,tenantId,action:'read'});
   if(!ID.test(opportunityId||''))invalid('Invalid opportunity ID');
   return db.transaction(tx=>tx.query('SELECT id,previous_stage,next_stage,actor_id,occurred_at FROM reach23_stage_events WHERE tenant_id=$1 AND opportunity_id=$2 ORDER BY occurred_at DESC,id',[tenantId,opportunityId]));
  }
 });
}
module.exports={createSyntheticPipeline,NEXT,OWNERSHIP_UP,OWNERSHIP_DOWN};
