import {readySql} from "@/lib/platform-store";
type RecordRow=Record<string,unknown>;
function rows<T>(v:unknown):T[]{if(Array.isArray(v))return v as T[];if(v&&typeof v==="object"&&"rows" in v&&Array.isArray(v.rows))return v.rows as T[];throw Error("Invalid monitor result");}
export type MonitorSummary={queuedOverHour:number;leasesOverdue:number;retryScheduled:number;retryExhausted:number;readyPending:number;outdatedRevision:number;attention:number};
export type MonitorItem={id:string;postId:string;channel:string;status:string;reason:string;attempts:number;lastUpdated:string};
export async function inspectSocialDelivery(workspaceId:string):Promise<{summary:MonitorSummary;items:MonitorItem[];externalPublishing:false;autoRecoveryEnabled:false}>{
 const db=await readySql();
 // No automatic re-send: a queued job could still have an in-flight callback.
 // A human must review stalled queue deliveries before a recovery action is designed.
 const statement=
  "WITH observations AS (SELECT j.id,j.post_id,j.channel,j.status,j.attempts,j.updated_at, "+
  "CASE WHEN j.status='queued' AND j.updated_at<now()-interval '60 minutes' THEN 'queued_over_hour' "+
  "WHEN j.status='pending' AND j.attempts>=5 THEN 'retry_exhausted' "+
  "WHEN j.status='pending' AND j.claim_until<now() THEN 'lease_expired' "+
  "WHEN j.status='pending' AND j.next_attempt_at>now() THEN 'retry_scheduled' "+
  "WHEN j.status='pending' AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=now()) AND j.claim_until IS NULL THEN 'ready_pending' "+
  "ELSE 'healthy' END AS reason, "+
  "CASE WHEN p.updated_at IS DISTINCT FROM j.post_revision THEN TRUE ELSE FALSE END AS outdated "+
  "FROM agency_social_dispatch_jobs j LEFT JOIN agency_social_posts p ON p.id=j.post_id AND p.workspace_id=j.workspace_id "+
  "WHERE j.workspace_id=$1::uuid) "+
  "SELECT id,post_id,channel,status,attempts,updated_at,reason,outdated FROM observations "+
  "ORDER BY CASE reason WHEN 'queued_over_hour' THEN 0 WHEN 'retry_exhausted' THEN 1 WHEN 'lease_expired' THEN 2 WHEN 'ready_pending' THEN 3 ELSE 4 END,updated_at ASC LIMIT 200";
 const result=rows<RecordRow>(await db.query(statement,[workspaceId]));
 const summary:MonitorSummary={queuedOverHour:0,leasesOverdue:0,retryScheduled:0,retryExhausted:0,readyPending:0,outdatedRevision:0,attention:0};
 const items:MonitorItem[]=[];
 for(const row of result){
  const reason=String(row.reason||"healthy"),outdated=row.outdated===true;
  if(reason==="queued_over_hour")summary.queuedOverHour++;
  if(reason==="lease_expired")summary.leasesOverdue++;
  if(reason==="retry_scheduled")summary.retryScheduled++;
  if(reason==="retry_exhausted")summary.retryExhausted++;
  if(reason==="ready_pending")summary.readyPending++;
  if(outdated)summary.outdatedRevision++;
  if(reason==="queued_over_hour"||reason==="lease_expired"||reason==="retry_exhausted"||outdated){
   items.push({id:String(row.id),postId:String(row.post_id),channel:String(row.channel),status:String(row.status),reason:outdated?"post_revision_changed":reason,attempts:Number(row.attempts||0),lastUpdated:new Date(String(row.updated_at)).toISOString()});
  }
 }
 summary.attention=items.length;
 return {summary,items,externalPublishing:false,autoRecoveryEnabled:false};
}
