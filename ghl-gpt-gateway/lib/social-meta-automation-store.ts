import {socialMetaWorkspaceDb} from "@/lib/reach-social-owner-db";
import {randomUUID} from "node:crypto";
import type {MetaActionDraft,MetaActionKind,MetaActionStatus} from "@/lib/social-meta-automation-contract";
type Row=Record<string,unknown>;
function rows(v:unknown):Row[]{if(Array.isArray(v))return v as Row[];if(v&&typeof v==="object"&&"rows" in v&&Array.isArray((v as {rows:unknown}).rows))return (v as {rows:Row[]}).rows;throw Error("Invalid database response");}
const columns="a.id,a.workspace_id,a.connection_id,a.kind,a.body,a.media_url,a.target_id,a.scheduled_at,a.status,a.created_at,a.updated_at,a.approved_at,a.attempted_at,a.completed_at,a.external_ref,a.error_code";
export type MetaStoredAction={id:string;workspaceId:string;connectionId:string;kind:MetaActionKind;body:string;
 mediaUrl:string|null;targetId:string|null;scheduledAt:string;status:MetaActionStatus;
 approvedAt:string|null;attemptedAt:string|null;completedAt:string|null;externalRef:string|null;errorCode:string|null};
const date=(v:unknown)=>v?new Date(String(v)).toISOString():null;
function format(a:Row):MetaStoredAction{return {
 id:String(a.id),workspaceId:String(a.workspace_id),connectionId:String(a.connection_id),kind:a.kind as MetaActionKind,
 body:String(a.body),mediaUrl:a.media_url?String(a.media_url):null,targetId:a.target_id?String(a.target_id):null,
 scheduledAt:date(a.scheduled_at)!,status:a.status as MetaActionStatus,approvedAt:date(a.approved_at),
 attemptedAt:date(a.attempted_at),completedAt:date(a.completed_at),externalRef:a.external_ref?String(a.external_ref):null,
 errorCode:a.error_code?String(a.error_code):null
};}
export async function listMetaActions(workspaceId:string):Promise<MetaStoredAction[]>{
 const db=await socialMetaWorkspaceDb(workspaceId);
 const x=rows(await db.query("SELECT "+columns+" FROM public.agency_social_meta_actions a WHERE a.workspace_id=$1::uuid ORDER BY a.created_at DESC LIMIT 100",[workspaceId]));
 return x.map(format);
}
export async function createMetaAction(input:MetaActionDraft):Promise<MetaStoredAction|null>{
 const db=await socialMetaWorkspaceDb(input.workspaceId);
 const q="INSERT INTO public.agency_social_meta_actions(id,workspace_id,connection_id,kind,body,media_url,target_id,scheduled_at,idempotency_key) "+
  "SELECT $1::uuid,c.workspace_id,c.id,$4,$5,$6,$7,$8::timestamptz,$9::uuid "+
  "FROM public.agency_social_meta_connections c "+
  "WHERE c.workspace_id=$2::uuid AND c.id=$3::uuid AND c.revoked_at IS NULL "+
  "AND (c.expires_at IS NULL OR c.expires_at>now()) "+
  "AND ((c.provider='facebook_pages' AND $4 LIKE 'facebook_%') OR (c.provider='instagram_professional' AND $4 LIKE 'instagram_%')) "+
  "AND (SELECT count(*) FROM public.agency_social_meta_actions a WHERE a.workspace_id=c.workspace_id AND a.created_at>now()-interval '1 hour')<20 "+
  "ON CONFLICT(workspace_id,idempotency_key) DO NOTHING RETURNING id";
 const inserted=rows(await db.query(q,[randomUUID(),input.workspaceId,input.connectionId,input.kind,input.body,input.mediaUrl,input.targetId,input.scheduledAt,input.idempotencyKey]));
 const result=rows(await db.query("SELECT "+columns+" FROM public.agency_social_meta_actions a WHERE a.workspace_id=$1::uuid AND a.idempotency_key=$2::uuid AND a.connection_id=$3::uuid LIMIT 1",[input.workspaceId,input.idempotencyKey,input.connectionId]));
 if(!inserted.length&&!result.length)return null;
 return result[0]?format(result[0]):null;
}
export async function transitionMetaAction(workspaceId:string,actionId:string,transition:"approve"|"cancel"):Promise<MetaStoredAction|null>{
 const db=await socialMetaWorkspaceDb(workspaceId);
 const approving=transition==="approve";
 const q="UPDATE public.agency_social_meta_actions a SET status=$3,approved_at=CASE WHEN $4::bool THEN now() ELSE approved_at END,updated_at=now() "+
  "WHERE a.workspace_id=$1::uuid AND a.id=$2::uuid AND (CASE WHEN $4::bool THEN a.status='draft' ELSE a.status IN('draft','approved') END) "+
  "AND EXISTS(SELECT 1 FROM public.agency_social_meta_connections c WHERE c.id=a.connection_id AND c.workspace_id=a.workspace_id AND c.revoked_at IS NULL) "+
  "RETURNING "+columns;
 const r=rows(await db.query(q,[workspaceId,actionId,approving?"approved":"canceled",approving]));
 if(r[0])await db.query("INSERT INTO public.agency_platform_audit_events(workspace_id,action,detail) VALUES($1::uuid,$2,jsonb_build_object('action_id',$3::text))",[workspaceId,approving?"social.meta.action_approved":"social.meta.action_canceled",actionId]);
 return r[0]?format(r[0]):null;
}
export async function claimMetaActions(workspaceId:string,actionId?:string,limit=3):Promise<MetaStoredAction[]>{
 const db=await socialMetaWorkspaceDb(workspaceId);
 const q="WITH due AS (SELECT a.id FROM public.agency_social_meta_actions a "+
  "JOIN public.agency_social_meta_connections c ON c.id=a.connection_id AND c.workspace_id=a.workspace_id "+
  "WHERE a.workspace_id=$1::uuid AND a.status='approved' AND a.approved_at IS NOT NULL "+
  "AND a.scheduled_at<=now() AND a.scheduled_at>now()-interval '7 days' "+
  "AND c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at>now()) "+
  "AND ($2::uuid IS NULL OR a.id=$2::uuid) "+
  "ORDER BY a.scheduled_at,a.id LIMIT $3 FOR UPDATE OF a SKIP LOCKED), "+
  "claimed AS (UPDATE public.agency_social_meta_actions a SET status='sending',attempted_at=now(),updated_at=now() "+
  "WHERE a.id IN(SELECT id FROM due) RETURNING "+columns+") SELECT * FROM claimed";
 const r=rows(await db.query(q,[workspaceId,actionId||null,Math.min(5,Math.max(1,limit))]));
 return r.map(format);
}
export async function finalizeMetaAction(workspaceId:string,actionId:string,outcome:{status:"sent"|"uncertain"|"blocked";externalRef?:string;errorCode?:string}):Promise<boolean>{
 const db=await socialMetaWorkspaceDb(workspaceId);
 const r=rows(await db.query("WITH done AS (UPDATE public.agency_social_meta_actions SET status=$3,external_ref=$4,error_code=$5,completed_at=now(),updated_at=now() "+
  "WHERE workspace_id=$1::uuid AND id=$2::uuid AND status='sending' RETURNING id), "+
  "logged AS (INSERT INTO public.agency_platform_audit_events(workspace_id,action,detail) "+
  "SELECT $1::uuid,'social.meta.delivery_result',jsonb_build_object('action_id',id,'status',$3::text) FROM done RETURNING id) SELECT id FROM done",
  [workspaceId,actionId,outcome.status,outcome.externalRef||null,outcome.errorCode||null]));
 return r.length===1;
}
export type MetaInboundEvent={workspaceId:string;connectionId:string;eventHash:string;type:"comment"|"message";
 targetId:string|null;senderId:string|null;occurredAt:string};
export async function recordMetaInbound(e:MetaInboundEvent):Promise<boolean>{
 const db=await socialMetaWorkspaceDb(e.workspaceId);
 await db.query("DELETE FROM public.agency_social_meta_webhook_events WHERE workspace_id=$1::uuid AND received_at<now()-interval '30 days'",[e.workspaceId]);
 const r=rows(await db.query("INSERT INTO public.agency_social_meta_webhook_events "+
  "(workspace_id,connection_id,event_hash,event_type,target_id,sender_id,occurred_at) "+
  "SELECT c.workspace_id,c.id,$3,$4,$5,$6,$7::timestamptz FROM public.agency_social_meta_connections c "+
  "WHERE c.workspace_id=$1::uuid AND c.id=$2::uuid AND c.revoked_at IS NULL "+
  "ON CONFLICT(workspace_id,event_hash) DO NOTHING RETURNING id",
  [e.workspaceId,e.connectionId,e.eventHash,e.type,e.targetId,e.senderId,e.occurredAt]));
 return r.length===1;
}
/** Only source-derived webhook targets may receive direct replies. Recipient-initiated
 * messages are constrained to a fresh 24-hour response window. */
export async function authorizedReplyTarget(workspaceId:string,connectionId:string,kind:MetaActionKind,targetId:string):Promise<boolean>{
 const db=await socialMetaWorkspaceDb(workspaceId);
 const msg=kind.endsWith("message_reply");
 const r=rows(await db.query(
  "SELECT id FROM public.agency_social_meta_webhook_events "+
  "WHERE workspace_id=$1::uuid AND connection_id=$2::uuid AND event_type=$3 "+
  "AND "+(msg?"sender_id":"target_id")+"=$4 "+
  "AND occurred_at<=now() AND occurred_at>now()-"+(msg?"interval '24 hours'":"interval '30 days'")+" LIMIT 1",
  [workspaceId,connectionId,msg?"message":"comment",targetId]));
 return r.length>0;
}
export async function metaWebhookConnection(workspaceId:string,provider:"facebook_pages"|"instagram_professional",accountId:string){
 const db=await socialMetaWorkspaceDb(workspaceId);
 const r=rows(await db.query("SELECT id FROM public.agency_social_meta_connections "+
 "WHERE workspace_id=$1::uuid AND provider=$2 AND provider_account_id=$3 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) LIMIT 1",
 [workspaceId,provider,accountId]));
 return r[0]?String(r[0].id):null;
}
export async function inboundMetaEvents(workspaceId:string){
 const db=await socialMetaWorkspaceDb(workspaceId);
 const r=rows(await db.query("SELECT e.id,e.connection_id,e.event_type,e.target_id,e.sender_id,e.occurred_at "+
 "FROM public.agency_social_meta_webhook_events e WHERE e.workspace_id=$1::uuid ORDER BY e.occurred_at DESC LIMIT 30",[workspaceId]));
 return r.map(x=>({id:String(x.id),connectionId:String(x.connection_id),type:String(x.event_type),
  targetId:x.target_id?String(x.target_id):null,senderId:x.sender_id?String(x.sender_id):null,occurredAt:date(x.occurred_at)}));
}
