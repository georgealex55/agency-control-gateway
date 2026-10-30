import {randomUUID} from "node:crypto";
import {readySql} from "@/lib/platform-store";
import {validQueueProbePayload,type QueueProbePayload} from "@/lib/social-queue-probe-contract";
type Row=Record<string,unknown>;
function rows<T>(v:unknown):T[]{if(Array.isArray(v))return v as T[];if(v&&typeof v==="object"&&"rows" in v&&Array.isArray(v.rows))return v.rows as T[];throw Error("Invalid queue probe database result");}
export type QueueProbe={id:string;workspaceId:string;status:"prepared"|"sent"|"acknowledged"|"send_failed";createdAt:string;sentAt:string|null;acknowledgedAt:string|null;lastErrorCode:string|null};
function toProbe(row:Row):QueueProbe{return {id:String(row.id),workspaceId:String(row.workspace_id),status:row.status as QueueProbe["status"],createdAt:new Date(String(row.created_at)).toISOString(),sentAt:row.sent_at?new Date(String(row.sent_at)).toISOString():null,acknowledgedAt:row.acknowledged_at?new Date(String(row.acknowledged_at)).toISOString():null,lastErrorCode:row.last_error_code?String(row.last_error_code):null};}
const columns="id,workspace_id,status,created_at,sent_at,acknowledged_at,last_error_code";
export async function createQueueProbe(workspaceId:string):Promise<QueueProbe|null>{
 const db=await readySql();
 // Unique minute bucket prevents concurrent clicks from creating extra queued checks.
 const data=rows<Row>(await db.query(
  "INSERT INTO agency_social_queue_probes(id,workspace_id,rate_bucket,status) "+
  "SELECT $1::uuid,id,date_trunc('minute',now()),'prepared' FROM agency_platform_workspaces "+
  "WHERE id=$2::uuid ON CONFLICT(workspace_id,rate_bucket) DO NOTHING RETURNING "+columns,
  [randomUUID(),workspaceId]
 ));
 return data[0]?toProbe(data[0]):null;
}
export async function markQueueProbeSent(payload:QueueProbePayload):Promise<void>{
 const db=await readySql();
 await db.query("UPDATE agency_social_queue_probes SET status='sent',sent_at=now() "+
  "WHERE id=$1::uuid AND workspace_id=$2::uuid AND status='prepared'",[payload.probeId,payload.workspaceId]);
}
export async function markQueueProbeSendFailed(payload:QueueProbePayload):Promise<void>{
 const db=await readySql();
 await db.query("UPDATE agency_social_queue_probes SET status='send_failed',last_error_code='QUEUE_SEND_REJECTED' "+
  "WHERE id=$1::uuid AND workspace_id=$2::uuid AND status='prepared'",[payload.probeId,payload.workspaceId]);
}
export async function acknowledgeQueueProbe(payload:QueueProbePayload):Promise<"acknowledged"|"already-completed"|"not-found">{
 if(!validQueueProbePayload(payload))throw Error("Invalid queue probe payload");
 const db=await readySql();
 const done=rows<{id:string}>(await db.query(
  "WITH confirmed AS (UPDATE agency_social_queue_probes SET status='acknowledged',acknowledged_at=now(),last_error_code=NULL "+
  "WHERE id=$1::uuid AND workspace_id=$2::uuid AND status IN ('prepared','sent') RETURNING id,workspace_id), "+
  "audited AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) "+
  "SELECT workspace_id,'social.queue.probe.acknowledged',jsonb_build_object('probe_id',id,'external_delivery',false) FROM confirmed RETURNING id) "+
  "SELECT id FROM confirmed",
  [payload.probeId,payload.workspaceId]
 ));
 if(done[0])return "acknowledged";
 const existing=rows<{id:string}>(await db.query(
  "SELECT id FROM agency_social_queue_probes WHERE id=$1::uuid AND workspace_id=$2::uuid",
  [payload.probeId,payload.workspaceId]
 ));
 return existing.length?"already-completed":"not-found";
}
export async function listQueueProbes(workspaceId:string):Promise<QueueProbe[]>{
 const db=await readySql();
 const data=rows<Row>(await db.query("SELECT "+columns+" FROM agency_social_queue_probes "+
  "WHERE workspace_id=$1::uuid ORDER BY created_at DESC LIMIT 20",[workspaceId]));
 return data.map(toProbe);
}
