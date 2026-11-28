import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {GOOGLE_ORIGIN,GOOGLE_CALLBACK,CALLBACK_PATH,groupFor,googleConfigured,authorizeGoogle} from "@/lib/reach-google-contract";
import {random,digest} from "@/lib/reach-google-oauth";
import {approvedGoogleWorkspace,createGoogleFlow,googleDomain,googleInventory,pendingCandidates,selectGoogle,verifyGoogleConnection,disconnectGoogle} from "@/lib/reach-google-store";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const w=workspaceFromQuery(req);if(!approvedGoogleWorkspace(w))return reply({error:"Approved owner workspace required"},428);
 const configured=googleConfigured(),canonical=req.nextUrl.origin===GOOGLE_ORIGIN;
 if(!configured||!canonical)return reply({workspaceId:w,configured,ready:false,callbackUrl:GOOGLE_CALLBACK,pending:[],connections:[],readOnly:true});
 try{
 const data=await googleInventory(w);
 return reply({workspaceId:w,configured,ready:true,callbackUrl:GOOGLE_CALLBACK,...data,readOnly:true});
 }catch{return reply({workspaceId:w,configured,ready:false,callbackUrl:GOOGLE_CALLBACK,pending:[],connections:[],readOnly:true,storageUnavailable:true});}
}
export async function POST(req:NextRequest){
 const denied=connectionGate(req,true);if(denied)return denied;
 if(!googleConfigured()||req.nextUrl.origin!==GOOGLE_ORIGIN)return reply({error:"Google OAuth configuration or canonical hostname required"},428);
 try{
 const b=await req.json(),w=b?.workspaceId;
 if(!approvedGoogleWorkspace(w))return reply({error:"Approved owner workspace required"},428);
 if(b.action==="start"){
 const g=groupFor(b.group);if(!g||(g.domain&&!validId(b.domainId)))return reply({error:"Choose permission group and registered domain"},400);
 const domainId=g.domain?b.domainId:null;if(domainId)await googleDomain(w,domainId);
 const state=random(),browser=random(),verifier=random();
 await createGoogleFlow(w,g.id,domainId,state,browser,verifier);
 const response=reply({workspaceId:w,authorizeUrl:authorizeGoogle(process.env.REACH_GOOGLE_CLIENT_ID!,g.id,state,digest(verifier)),readOnly:true});
 response.cookies.set("reach_google_browser",browser,{httpOnly:true,secure:true,sameSite:"lax",path:CALLBACK_PATH,maxAge:600});return response;
 }
 if(!validId(b.id))return reply({error:"Choose a valid Google grant"},400);
 if(b.action==="discover")return reply({workspaceId:w,id:b.id,candidates:await pendingCandidates(w,b.id),readOnly:true});
 if(b.action==="select"){
 if(typeof b.resourceId!=="string"||!b.resourceId||b.resourceId.length>500||b.confirm!==true)return reply({error:"Confirm resource selection"},400);
 await selectGoogle(w,b.id,b.resourceId);return reply({workspaceId:w,selected:true,readOnly:true});
 }
 if(b.action==="verify")return reply({workspaceId:w,id:b.id,verified:await verifyGoogleConnection(w,b.id),readOnly:true});
 if(b.action==="disconnect"&&b.confirm===true)return reply({workspaceId:w,disconnected:await disconnectGoogle(w,b.id),readOnly:true});
 return reply({error:"Unsupported action"},400);
 }catch{return reply({error:"Google request failed. Existing connections were preserved; check permissions, setup or duplicate resource selection."},503);}
}
