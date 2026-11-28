import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {GOOGLE_ORIGIN,GOOGLE_CALLBACK,CALLBACK_PATH,groupFor,googleConfigured,authorizeGoogle} from "@/lib/reach-google-contract";
import {resolvedGoogleEnv} from "@/lib/reach-google-developer-store";
import {canonicalGoogleRequest,GOOGLE_FLOW_SECONDS,safeDiagnostic,GOOGLE_DIAGNOSTICS,type GoogleDiagnostic} from "@/lib/reach-google-diagnostics";
import {random,digest} from "@/lib/reach-google-oauth";
import {approvedGoogleWorkspace,createGoogleFlow,googleDomain,googleInventory,pendingCandidates,selectGoogle,verifyGoogleConnection,disconnectGoogle,reuseGoogleGrant} from "@/lib/reach-google-store";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
function canonical(req:NextRequest){return canonicalGoogleRequest(req.nextUrl.origin,req.headers.get("host"),req.headers.get("x-forwarded-host"),req.headers.get("x-forwarded-proto"),process.env.VERCEL_ENV);}
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const w=workspaceFromQuery(req);if(!approvedGoogleWorkspace(w))return reply({error:"Approved owner workspace required"},428);
 const env=await resolvedGoogleEnv(w);
 const configured=googleConfigured(env),isCanonical=canonical(req);
 if(!configured||!isCanonical)return reply({workspaceId:w,configured,ready:false,callbackUrl:GOOGLE_CALLBACK,pending:[],connections:[],readOnly:true});
 try{
 const data=await googleInventory(w,env);
 return reply({workspaceId:w,configured,ready:true,callbackUrl:GOOGLE_CALLBACK,...data,readOnly:true});
 }catch{return reply({workspaceId:w,configured,ready:false,callbackUrl:GOOGLE_CALLBACK,pending:[],connections:[],readOnly:true,storageUnavailable:true});}
}
export async function POST(req:NextRequest){
 const denied=connectionGate(req,true);if(denied)return denied;
 if(!canonical(req))return reply({error:"Google OAuth configuration or canonical hostname required"},428);
 let stage:GoogleDiagnostic="flow_storage";
 try{
 const b=await req.json(),w=b?.workspaceId;
 if(!approvedGoogleWorkspace(w))return reply({error:"Approved owner workspace required"},428);
 const env=await resolvedGoogleEnv(w);if(!googleConfigured(env))return reply({error:"Google OAuth is not activated"},428);
 if(b.action==="start"){
 const g=groupFor(b.group);if(!g||(g.domain&&!validId(b.domainId)))return reply({error:"Choose permission group and registered domain"},400);
 const domainId=g.domain?b.domainId:null;if(domainId)await googleDomain(w,domainId);
 const state=random(),browser=random(),verifier=random();
 await createGoogleFlow(w,g.id,domainId,state,browser,verifier,env);
 const response=reply({workspaceId:w,authorizeUrl:authorizeGoogle(env.REACH_GOOGLE_CLIENT_ID!,g.id,state,digest(verifier)),readOnly:true});
 response.cookies.set("reach_google_browser_"+digest(state),browser,{httpOnly:true,secure:true,sameSite:"lax",path:CALLBACK_PATH,maxAge:GOOGLE_FLOW_SECONDS});return response;
 }
 if(!validId(b.id))return reply({error:"Choose a valid Google grant"},400);
 if(b.action==="reuse"){
 const g=groupFor(b.group);if(!g||(g.domain&&!validId(b.domainId))||b.confirm!==true)return reply({error:"Confirm reuse and select registered domain"},400);
 await reuseGoogleGrant(w,b.id,g.id,g.domain?b.domainId:null,env);return reply({workspaceId:w,reused:true,readOnly:true});
 }
 if(b.action==="discover"){stage="resource_unavailable";return reply({workspaceId:w,id:b.id,candidates:await pendingCandidates(w,b.id,env),readOnly:true});}
 if(b.action==="select"){stage="selection_unavailable";
 if(typeof b.resourceId!=="string"||!b.resourceId||b.resourceId.length>500||b.confirm!==true)return reply({error:"Confirm resource selection"},400);
 await selectGoogle(w,b.id,b.resourceId,env);return reply({workspaceId:w,selected:true,readOnly:true});
 }
 if(b.action==="verify"){stage="verification_unavailable";return reply({workspaceId:w,id:b.id,verified:await verifyGoogleConnection(w,b.id,env),readOnly:true});}
 if(b.action==="disconnect"&&b.confirm===true)return reply({workspaceId:w,disconnected:await disconnectGoogle(w,b.id,env),readOnly:true});
 return reply({error:"Unsupported action"},400);
 }catch(e){const code=safeDiagnostic(e,stage);console.info("reach_google_action",code);return reply({error:GOOGLE_DIAGNOSTICS[code],diagnostic:code},503);}
}
