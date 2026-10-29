import {randomUUID} from "node:crypto";
import {readySql} from "@/lib/platform-store";
import {SOCIAL_DRY_TOPIC,validDryPayload} from "@/lib/social-queue-contract";
export {SOCIAL_DRY_TOPIC,validDryPayload} from "@/lib/social-queue-contract";
export type {DryRunPayload} from "@/lib/social-queue-contract";
export type DispatchJob={id:string;workspaceId:string;postId:string;channel:string;status:string;createdAt:string;completedAt:string|null};
type Row=Record<string,unknown>;
function rows<T>(v:unknown):T[]{if(Array.isArray(v))return v as T[];if(v&&typeof v==="object"&&"rows" in v&&Array.isArray(v.rows))return v.rows as T[];throw new Error("Invalid database result");}
function asJob(row:Row):DispatchJob{return {id:String(row.id),workspaceId:String(row.workspace_id),postId:String(row.post_id),channel:String(row.channel),status:String(row.status),createdAt:new Date(String(row.created_at)).toISOString(),completedAt:row.completed_at?new Date(String(row.completed_at)).toISOString():null};}
export async function prepareDueJobs(workspaceId:string):Promise<{jobs:DispatchJob[];total:number}>{
 const db=await readySql();
 // Exact post revision and channel per row prevent queue delivery of edited or revoked approvals.
 // Queue retention is finite; the long-term schedule stays in PostgreSQL until due.
 await db.query(
  "INSERT INTO agency_social_dispatch_jobs(id,workspace_id,post_id,channel,post_revision,status) "+
  "SELECT gen_random_uuid(), p.workspace_id,p.id,c.channel,p.updated_at,'pending' "+
  "FROM agency_social_posts p CROSS JOIN LATERAL jsonb_array_elements_text(p.channels) AS c(channel) "+
  "WHERE p.workspace_id=$1::uuid AND p.state='approved' AND p.scheduled_at IS NOT NULL "+
  "AND p.scheduled_at<=now() AND p.scheduled_at > now() - interval '30 days' "+
  "ON CONFLICT(post_id,channel,post_revision) DO NOTHING",
  [workspaceId]
 );
 const pending=rows<Row>(await db.query(
  "SELECT id,workspace_id,post_id,channel,status,created_at,completed_at FROM agency_social_dispatch_jobs "+
  "WHERE workspace_id=$1::uuid AND status='pending' ORDER BY created_at ASC LIMIT 25",
  [workspaceId]
 )).map(asJob);
 const total=rows<{n:number}>(await db.query(
  "SELECT count(*)::int AS n FROM agency_social_dispatch_jobs WHERE workspace_id=$1::uuid AND status='pending'",[workspaceId]
 ))[0]?.n??0;
 return {jobs:pending,total:Number(total)};
}
export async function markQueued(jobId:string,workspaceId:string):Promise<void>{
 const db=await readySql();
 await db.query("UPDATE agency_social_dispatch_jobs SET status='queued',updated_at=now() WHERE id=$1::uuid AND workspace_id=$2::uuid AND status='pending'",[jobId,workspaceId]);
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
 return rows<Row>(await db.query("SELECT id,workspace_id,post_id,channel,status,created_at,completed_at FROM agency_social_dispatch_jobs WHERE workspace_id=$1::uuid ORDER BY created_at DESC LIMIT 100",[workspaceId])).map(asJob);
}
