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
  "CASE WHEN j.status IN ('pending','queued') AND (p.updated_at IS DISTINCT FROM j.post_revision OR p.state IS DISTINCT FROM 'approved') THEN TRUE ELSE FALSE END AS outdated "+
  "FROM agency_social_dispatch_jobs j LEFT JOIN agency_social_posts p ON p.id=j.post_id AND p.workspace_id=j.workspace_id "+
  "WHERE j.workspace_id=$1::uuid) "+
  "SELECT id,post_id,channel,status,attempts,updated_at,reason,outdated FROM observations "+
  "ORDER BY CASE reason WHEN 'queued_over_hour' THEN 0 WHEN 'retry_exhausted' THEN 1 WHEN 'lease_expired' THEN 2 WHEN 'ready_pending' THEN 3 ELSE 4 END,updated_at ASC LIMIT 200";
 const result=rows<RecordRow>(await db.query(statement,[workspaceId]));
 const aggregate=rows<RecordRow>(await db.query(
  "SELECT "+
  "count(*) FILTER(WHERE j.status='queued' AND j.updated_at<now()-interval '60 minutes')::int AS queued_over_hour, "+
  "count(*) FILTER(WHERE j.status='pending' AND j.claim_until<now())::int AS leases_overdue, "+
  "count(*) FILTER(WHERE j.status='pending' AND j.next_attempt_at>now())::int AS retry_scheduled, "+
  "count(*) FILTER(WHERE j.status='pending' AND j.attempts>=5)::int AS retry_exhausted, "+
  "count(*) FILTER(WHERE j.status='pending' AND j.next_attempt_at IS NULL AND j.claim_until IS NULL AND j.attempts<5)::int AS ready_pending, "+
  "count(*) FILTER(WHERE j.status IN ('pending','queued') AND (p.updated_at IS DISTINCT FROM j.post_revision OR p.state IS DISTINCT FROM 'approved'))::int AS outdated_revision, "+
  "count(*) FILTER(WHERE (j.status='queued' AND j.updated_at<now()-interval '60 minutes') OR "+
  "(j.status='pending' AND (j.claim_until<now() OR j.attempts>=5)) OR "+
  "(j.status IN ('pending','queued') AND (p.updated_at IS DISTINCT FROM j.post_revision OR p.state IS DISTINCT FROM 'approved')))::int AS attention "+
  "FROM agency_social_dispatch_jobs j LEFT JOIN agency_social_posts p ON p.id=j.post_id AND p.workspace_id=j.workspace_id "+
  "WHERE j.workspace_id=$1::uuid",[workspaceId]
 ))[0]||{};

 const summary:MonitorSummary={queuedOverHour:Number(aggregate.queued_over_hour||0),leasesOverdue:Number(aggregate.leases_overdue||0),retryScheduled:Number(aggregate.retry_scheduled||0),retryExhausted:Number(aggregate.retry_exhausted||0),readyPending:Number(aggregate.ready_pending||0),outdatedRevision:Number(aggregate.outdated_revision||0),attention:Number(aggregate.attention||0)};
 const items:MonitorItem[]=[];
 for(const row of result){
  const reason=String(row.reason||"healthy"),outdated=row.outdated===true;
  if(reason==="queued_over_hour"||reason==="lease_expired"||reason==="retry_exhausted"||outdated){
   items.push({id:String(row.id),postId:String(row.post_id),channel:String(row.channel),status:String(row.status),reason:outdated?"post_revision_changed":reason,attempts:Number(row.attempts||0),lastUpdated:new Date(String(row.updated_at)).toISOString()});
  }
 }
 return {summary,items,externalPublishing:false,autoRecoveryEnabled:false};
}
