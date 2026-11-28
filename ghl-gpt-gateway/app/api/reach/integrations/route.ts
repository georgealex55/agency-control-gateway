import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {ownerSocialStorageConfigured,socialMetaWorkspaceDb} from "@/lib/reach-social-owner-db";
import {validId} from "@/lib/social-contract";
import {VERIFY_IDS,configured,verifyIntegration,type VerifyId} from "@/lib/reach-integration-verification";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);
 if(!workspaceId||!ownerSocialStorageConfigured()||workspaceId!==process.env.REACH_SOCIAL_OWNER_WORKSPACE_ID)return reply({error:"Approved owner workspace required"},428);
 try{
 const db=await socialMetaWorkspaceDb(workspaceId);
 const rows=await db.query("SELECT id,hostname FROM public.agency_platform_domains WHERE workspace_id=$1::uuid ORDER BY created_at DESC LIMIT 100",[workspaceId]);
 if(!Array.isArray(rows))throw Error("Registry unavailable");
 const domains=rows.map(d=>({id:String(d.id),hostname:String(d.hostname),ga4Configured:configured("ga4",String(d.hostname)),searchConfigured:configured("search_console",String(d.hostname))}));
 return reply({workspaceId,domains,shopifyConfigured:configured("shopify",null),pagespeedKeyConfigured:configured("pagespeed",null),readOnly:true});
 }catch{return reply({error:"Integration setup status unavailable"},503);}
}
export async function POST(req:NextRequest){
 const denied=connectionGate(req,true);if(denied)return denied;
 try{
 const body=await req.json(),workspaceId=body?.workspaceId,provider=body?.provider;
 if(!validId(workspaceId)||!ownerSocialStorageConfigured()||workspaceId!==process.env.REACH_SOCIAL_OWNER_WORKSPACE_ID||!VERIFY_IDS.includes(provider))return reply({error:"Invalid verification request"},400);
 let host:string|null=null;
 if(provider!=="shopify"){
 if(!validId(body.domainId))return reply({error:"Choose a registered domain"},400);
 const db=await socialMetaWorkspaceDb(workspaceId),rows=await db.query("SELECT hostname FROM public.agency_platform_domains WHERE workspace_id=$1::uuid AND id=$2::uuid LIMIT 1",[workspaceId,body.domainId]);
 if(!Array.isArray(rows)||rows.length!==1||typeof rows[0].hostname!=="string")return reply({error:"Domain unavailable"},404);
 host=rows[0].hostname;
 }
 return reply({workspaceId,domainId:provider==="shopify"?null:body.domainId,verification:await verifyIntegration(provider as VerifyId,host),readOnly:true});
 }catch{return reply({error:"Verification unavailable; no accounts changed"},503);}
}
