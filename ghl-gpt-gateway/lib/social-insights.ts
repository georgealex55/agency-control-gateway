import {readySql} from "@/lib/platform-store";
type Row=Record<string,unknown>;
function asRows(v:unknown):Row[]{if(Array.isArray(v))return v as Row[];if(v&&typeof v==="object"&&"rows" in v&&Array.isArray(v.rows))return v.rows as Row[];throw Error("Invalid metrics response");}
const states=["draft","planned","approved"] as const;
const jobStates=["pending","queued","simulated","canceled"] as const;
export type SocialInsights={
  workspaceId:string;internalOnly:true;
  drafts:Record<(typeof states)[number],number>;
  dispatch:Record<(typeof jobStates)[number],number>;
  retryExhausted:number;
  scheduledNextSevenDays:number;
  overdueApproved:number;
  channelPlans:{channel:string;count:number}[];
  metricsAvailable:false;externalReach:null;externalEngagement:null;
};
export async function socialInsights(workspaceId:string):Promise<SocialInsights>{
 const db=await readySql();
 const [draftRows,jobRows,channelRows,upcomingRows]=await Promise.all([
  db.query("SELECT state,count(*)::int AS n FROM agency_social_posts WHERE workspace_id=$1::uuid GROUP BY state",[workspaceId]),
  db.query("SELECT status,count(*)::int AS n,count(*) FILTER (WHERE status='pending' AND attempts>=5)::int AS exhausted FROM agency_social_dispatch_jobs WHERE workspace_id=$1::uuid GROUP BY status",[workspaceId]),
  db.query("SELECT c.channel,count(*)::int AS n FROM agency_social_posts p CROSS JOIN LATERAL jsonb_array_elements_text(p.channels) c(channel) WHERE p.workspace_id=$1::uuid GROUP BY c.channel ORDER BY n DESC,c.channel LIMIT 8",[workspaceId]),
  db.query("SELECT count(*) FILTER (WHERE scheduled_at>now() AND scheduled_at<=now()+interval '7 days')::int AS upcoming,count(*) FILTER (WHERE scheduled_at<=now() AND state='approved')::int AS overdue FROM agency_social_posts WHERE workspace_id=$1::uuid",[workspaceId])
 ]);
 const drafts:SocialInsights["drafts"]={draft:0,planned:0,approved:0};
 const dispatch:SocialInsights["dispatch"]={pending:0,queued:0,simulated:0,canceled:0};
 for(const row of asRows(draftRows))if(states.some(x=>x===row.state))drafts[row.state as keyof typeof drafts]=Number(row.n);
 let retryExhausted=0;
 for(const row of asRows(jobRows)){if(jobStates.some(x=>x===row.status))dispatch[row.status as keyof typeof dispatch]=Number(row.n);retryExhausted+=Number(row.exhausted||0);}
 const upcoming=asRows(upcomingRows)[0]||{};
 return {workspaceId,internalOnly:true,drafts,dispatch,retryExhausted,scheduledNextSevenDays:Number(upcoming.upcoming||0),overdueApproved:Number(upcoming.overdue||0),channelPlans:asRows(channelRows).map(r=>({channel:String(r.channel),count:Number(r.n)})),metricsAvailable:false,externalReach:null,externalEngagement:null};
}
