import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {socialMetaWorkspaceDb} from "@/lib/reach-social-owner-db";
import {META_PROVIDERS} from "@/lib/social-meta-contract";
import {assessConnectionHealth,healthSummary} from "@/lib/reach-connection-health";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Row={id:string;provider:string;provider_account_id:string;provider_display_name:string;
 connected_at:string|Date;last_verified_at:string|Date|null;expires_at:string|Date|null};
const toIso=(value:string|Date|null):string|null=>{
 if(value===null)return null;
 const d=new Date(value);return Number.isFinite(d.getTime())?d.toISOString():null;
};
function parseRows(v:unknown):Row[]{
 if(Array.isArray(v))return v as Row[];
 if(v&&typeof v==="object"&&"rows" in v&&Array.isArray(v.rows))return v.rows as Row[];
 throw Error("Invalid storage response");
}
/** Read-only snapshot. Existing user session is platform owner only;
 * a true workspace-customer identity boundary is a future release gate.
 * The workspace DB enforces the production owner-workspace allowlist and RLS.
 */
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);
 if(!workspaceId)return reply({error:"Valid workspace required"},400);
 try{
  const db=await socialMetaWorkspaceDb(workspaceId);
  const raw=parseRows(await db.query(
   "SELECT id,provider,provider_account_id,provider_display_name,connected_at,last_verified_at,expires_at "+
   "FROM agency_social_meta_connections WHERE workspace_id=$1::uuid ORDER BY connected_at DESC LIMIT 100",
   [workspaceId]));
  const now=Date.now();
  const connections=raw.filter(v=>META_PROVIDERS.some(p=>p===v.provider)).map(v=>{
   const lastVerifiedAt=toIso(v.last_verified_at),expiresAt=toIso(v.expires_at);
   return {id:String(v.id),provider:v.provider,accountId:String(v.provider_account_id),
    name:String(v.provider_display_name).slice(0,150),connectedAt:toIso(v.connected_at),
    lastVerifiedAt,expiresAt,status:assessConnectionHealth({lastVerifiedAt,expiresAt},now)};
  });
  return reply({workspaceId,checkedAt:new Date(now).toISOString(),liveProviderPing:false,
   readOnly:true,publishingEnabled:false,connections,summary:healthSummary(connections)});
 }catch{
  return reply({error:"Connection health snapshot unavailable. No live provider check was performed."},503);
 }
}
