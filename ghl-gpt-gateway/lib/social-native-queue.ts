import {readySql} from "@/lib/platform-store";
import {SOCIAL_DRY_TOPIC,validDryPayload} from "@/lib/social-queue-contract";
export {SOCIAL_DRY_TOPIC,validDryPayload} from "@/lib/social-queue-contract";
export type {DryRunPayload} from "@/lib/social-queue-contract";
export type DispatchJob={id:string;workspaceId:string;postId:string;channel:string;status:string;attempts:number;nextAttemptAt:string|null;lastErrorCode:string|null;createdAt:string;completedAt:string|null};
type Row=Record<string,unknown>;
function rows<T>(v:unknown):T[]{if(Array.isArray(v))return v as T[];if(v&&typeof v==="object"&&"rows" in v&&Array.isArray(v.rows))return v.rows as T[];throw new Error("Invalid database result");}
function asJob(row:Row):DispatchJob{return {id:String(row.id),workspaceId:String(row.workspace_id),postId:String(row.post_id),channel:String(row.channel),status:String(row.status),attempts:Number(row.attempts||0),nextAttemptAt:row.next_attempt_at?new Date(String(row.next_attempt_at)).toISOString():null,lastErrorCode:row.last_error_code?String(row.last_error_code):null,createdAt:new Date(String(row.created_at)).toISOString(),completedAt:row.completed_at?new Date(String(row.completed_at)).toISOString():null};}
/** Prepare due work, then lease up to 25 jobs atomically. Competing dispatch requests cannot lease the same job. */
export async function prepareDueJobs(workspaceId:string):Promise<{jobs:DispatchJob[];total:number;exhausted:number}>{
 const db=await readySql();
 await db.query(
  "INSERT INTO agency_social_dispatch_jobs(id,workspace_id,post_id,channel,post_revision,status) "+
  "SELECT gen_random_uuid(),p.workspace_id,p.id,c.channel,p.updated_at,'pending' "+
  "FROM agency_social_posts p CROSS JOIN LATERAL jsonb_array_elements_text(p.channels) AS c(channel) "+
  "WHERE p.workspace_id=$1::uuid AND p.state='approved' AND p.scheduled_at IS NOT NULL "+
  "AND p.scheduled_at<=now() AND p.scheduled_at>now()-interval '30 days' "+
  "ON CONFLICT(post_id,channel,post_revision) DO NOTHING",[workspaceId]
 );
 const claimed=rows<Row>(await db.query(
  "WITH eligible AS (SELECT id FROM agency_social_dispatch_jobs "+
  "WHERE workspace_id=$1::uuid AND status='pending' AND attempts<5 "+
  "AND (next_attempt_at IS NULL OR next_attempt_at<=now()) "+
  "AND (claim_until IS NULL OR claim_until<=now()) "+
  "ORDER BY created_at,id LIMIT 25 FOR UPDATE SKIP LOCKED), "+
  "leased AS (UPDATE agency_social_dispatch_jobs SET "+
  "claim_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() "+
  "WHERE id IN(SELECT id FROM eligible) RETURNING "+
  "id,workspace_id,post_id,channel,status,attempts,next_attempt_at,last_error_code,created_at,completed_at) "+
  "SELECT * FROM leased",[workspaceId]
 )).map(asJob);
 const totals=rows<{total:number;exhausted:number}>(await db.query(
  "SELECT count(*) FILTER(WHERE status='pending')::int AS total, "+
  "count(*) FILTER(WHERE status='pending' AND attempts>=5)::int AS exhausted "+
  "FROM agency_social_dispatch_jobs WHERE workspace_id=$1::uuid",[workspaceId]
 ))[0]||{total:0,exhausted:0};
 return {jobs:claimed,total:Number(totals.total),exhausted:Number(totals.exhausted)};
}
export async function markQueued(jobId:string,workspaceId:string):Promise<void>{
 const db=await readySql();
 await db.query("UPDATE agency_social_dispatch_jobs SET status='queued',claim_until=NULL,next_attempt_at=NULL,last_error_code=NULL,updated_at=now() WHERE id=$1::uuid AND workspace_id=$2::uuid AND status='pending' AND claim_until>now()",[jobId,workspaceId]);
}
export async function markSendFailed(jobId:string,workspaceId:string):Promise<void>{
 const db=await readySql();
 await db.query(
  "UPDATE agency_social_dispatch_jobs SET claim_until=NULL,last_error_code='QUEUE_SEND_FAILED', "+
  "next_attempt_at=now()+interval '60 seconds'*GREATEST(1,LEAST(attempts,5)),updated_at=now() "+
  "WHERE id=$1::uuid AND workspace_id=$2::uuid AND status='pending'",
  [jobId,workspaceId]
 );
}
export async function consumeDryRun(payload:import("@/lib/social-queue-contract").DryRunPayload):Promise<{status:"simulated"|"canceled"|"already-processed"|"not-found"}>{
 if(!validDryPayload(payload))throw new Error("Invalid queue payload");
 const db=await readySql();
 // An idempotent atomic update guards retries, edits, revocation, cross-tenant IDs and channel change.
 const changed=rows<{status:"simulated"|"canceled"}>(await db.query(
  "WITH changed AS (UPDATE agency_social_dispatch_jobs j SET "+
  "status=CASE WHEN p.id IS NOT NULL AND p.workspace_id=j.workspace_id AND p.state='approved' "+
  "AND p.updated_at=j.post_revision AND p.scheduled_at<=now() AND "+
  "p.channels ? j.channel THEN 'simulated' ELSE 'canceled' END, "+
  "updated_at=now(),completed_at=now() "+
  "FROM (SELECT id,workspace_id,state,updated_at,scheduled_at,channels FROM agency_social_posts) p "+
  "WHERE j.id=$1::uuid AND j.workspace_id=$2::uuid AND j.post_id=$3::uuid AND "+
  "j.post_id=p.id AND j.status IN ('pending','queued') RETURNING j.id,j.workspace_id,j.status), "+
  "audited AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) "+
  "SELECT workspace_id,CASE WHEN status='simulated' THEN 'social.delivery.simulated' ELSE 'social.delivery.canceled' END, "+
  "jsonb_build_object('job_id',id,'external_delivery',false) FROM changed RETURNING id) SELECT status FROM changed",
  [payload.jobId,payload.workspaceId,payload.postId]
 ));
 if(changed[0])return {status:changed[0].status};
 // Missing/mismatched payload is never allowed to dispatch. Retries are no-op.
 const existing=rows<{status:string}>(await db.query("SELECT status FROM agency_social_dispatch_jobs WHERE id=$1::uuid AND workspace_id=$2::uuid AND post_id=$3::uuid",[payload.jobId,payload.workspaceId,payload.postId]));
 return {status:existing[0]?"already-processed":"not-found"};
}
export async function listDeliveryJobs(workspaceId:string):Promise<DispatchJob[]>{
 const db=await readySql();
 return rows<Row>(await db.query("SELECT id,workspace_id,post_id,channel,status,attempts,next_attempt_at,last_error_code,created_at,completed_at FROM agency_social_dispatch_jobs WHERE workspace_id=$1::uuid ORDER BY created_at DESC LIMIT 100",[workspaceId])).map(asJob);
}
