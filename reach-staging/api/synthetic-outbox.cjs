'use strict';
// REACH 2.2 STAGING ONLY: receipt reconciliation; NEVER deliver to providers.
const {randomUUID}=require('node:crypto');
const KEY=/^[A-Za-z0-9_-]{1,80}$/;
const CHANNELS=new Set(['email','sms','webhook','postiz']);
function createSyntheticOutbox({sessions,db,clock=()=>new Date()}={}){
 if(!sessions||typeof sessions.resolve!=='function'||typeof sessions.validCsrf!=='function'||!db||typeof db.transaction!=='function')throw new TypeError('Trusted sessions and transactional adapter required');
 return Object.freeze({async run({token,csrf,tenantId,eventKey,channel,operation,receiptId}={}){
  const session=sessions.resolve(token);
  if(!session)return {status:401,body:{error:'Authentication required'}};
  if(!Object.isFrozen(session)||session.tenantId!==tenantId||session.role!=='owner'||!sessions.validCsrf(token,csrf))return {status:403,body:{error:'Forbidden'}};
  if(!KEY.test(tenantId||'')||!KEY.test(eventKey||'')||!CHANNELS.has(channel)||!['enqueue','ack','retry','ambiguous','mark_retry_ready'].includes(operation)||(operation!=='enqueue'&&!KEY.test(receiptId||'')))return {status:400,body:{error:'Invalid synthetic outbox request'}};
  try{
   const result=await db.transaction(async tx=>{
    if(!tx||typeof tx.query!=='function')throw Error('Invalid transaction adapter');
    if(operation==='enqueue'){
     const inserted=await tx.query("INSERT INTO reach22_synthetic_outbox (tenant_id,id,event_key,channel,status,attempts) VALUES ($1,$2,$3,$4,'pending',0) ON CONFLICT (tenant_id,event_key,channel) DO NOTHING RETURNING id,status,attempts",[tenantId,randomUUID(),eventKey,channel]);
     if(inserted.rows.length)return {duplicate:false,record:inserted.rows[0]};
     const prior=await tx.query('SELECT id,status,attempts FROM reach22_synthetic_outbox WHERE tenant_id=$1 AND event_key=$2 AND channel=$3',[tenantId,eventKey,channel]);
     return {duplicate:true,record:prior.rows[0]};
    }
    const found=await tx.query('SELECT id,status,attempts FROM reach22_synthetic_outbox WHERE tenant_id=$1 AND id=$2 AND event_key=$3 AND channel=$4 FOR UPDATE',[tenantId,receiptId,eventKey,channel]);
    const current=found.rows[0];
    if(!current)return {missing:true};
    const allowed=operation==='ack'||operation==='ambiguous'?['pending','retry_ready']:operation==='mark_retry_ready'?['pending']:['retry_ready'];
    if(!allowed.includes(current.status)||(operation==='retry'&&current.attempts>=3))return {conflict:true,record:current};
    const next=operation==='ack'?'acknowledged':operation==='ambiguous'?'needs_review':operation==='mark_retry_ready'?'retry_ready':'pending';
    const attempts=current.attempts+(operation==='retry'?1:0);
    const updated=await tx.query('UPDATE reach22_synthetic_outbox SET status=$5,attempts=$6,updated_at=$7 WHERE tenant_id=$1 AND id=$2 AND event_key=$3 AND channel=$4 RETURNING id,status,attempts',[tenantId,receiptId,eventKey,channel,next,attempts,clock().toISOString()]);
    return {record:updated.rows[0]};
   });
   return {status:result.missing?404:result.conflict?409:operation==='enqueue'&&!result.duplicate?201:200,body:{source:'STAGING_SYNTHETIC',connected:false,providerStatus:'DISCONNECTED',...result}};
  }catch{return {status:503,body:{error:'Synthetic staging storage unavailable'}};}
 }});
}
const UP=`CREATE TABLE IF NOT EXISTS reach22_synthetic_outbox (
 tenant_id text NOT NULL, id text NOT NULL, event_key text NOT NULL,
 channel text NOT NULL CHECK (channel IN ('email','sms','webhook','postiz')),
 status text NOT NULL CHECK (status IN ('pending','retry_ready','acknowledged','needs_review')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,event_key,channel),
 CHECK (length(tenant_id)>0)
);`;
const DOWN='DROP TABLE IF EXISTS reach22_synthetic_outbox;';
module.exports={createSyntheticOutbox,UP,DOWN};
