import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {approvedGoogleWorkspace} from "@/lib/reach-google-store";
import {canonicalGoogleRequest} from "@/lib/reach-google-diagnostics";
import {googleDeveloperStatus,saveGoogleDeveloper,enableGoogleDeveloper,replaceGoogleDeveloper,GoogleReplacementBlocked,GoogleStorageVerificationError} from "@/lib/reach-google-developer-store";
import {validateGoogleDeveloper,parseGoogleWebClient} from "@/lib/reach-google-developer-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";
function canonical(req:NextRequest){return canonicalGoogleRequest(req.nextUrl.origin,req.headers.get("host"),req.headers.get("x-forwarded-host"),req.headers.get("x-forwarded-proto"),process.env.VERCEL_ENV);}
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const w=workspaceFromQuery(req);if(!approvedGoogleWorkspace(w)||!canonical(req))return reply({error:"Approved canonical owner workspace required"},428);
 return reply({workspaceId:w,status:await googleDeveloperStatus(w)});
}
export async function POST(req:NextRequest){
 const denied=connectionGate(req,true);if(denied)return denied;
 if(!canonical(req))return reply({error:"Use the canonical REACH host"},428);
 try{
 const raw=await req.text();if(raw.length>40000)return reply({error:"Configuration too large"},413);
 const b=JSON.parse(raw),w=b?.workspaceId;if(!approvedGoogleWorkspace(w)||b.confirm!==true)return reply({error:"Confirm owner configuration change"},400);
 if(b.action==="save"){
 let config;try{config=typeof b.webClientJson==="string"?parseGoogleWebClient(b.webClientJson):validateGoogleDeveloper(b.config);}catch{return reply({error:"Use a valid Google Web OAuth client, project ID and secret; imported JSON must include the exact callback."},400);}
 return reply({workspaceId:w,status:await saveGoogleDeveloper(w,config)});
 }
 if(b.action==="replace"){
 if(typeof b.expectedUpdatedAt!=="string"||b.expectedUpdatedAt.length>40)return reply({error:"Confirm the current Google configuration before replacement."},400);
 let config;try{config=typeof b.webClientJson==="string"?parseGoogleWebClient(b.webClientJson):validateGoogleDeveloper(b.config);}catch{return reply({error:"Enter the new Web OAuth project ID, client ID and secret, or import JSON with the exact REACH callback."},400);}
 return reply({workspaceId:w,status:await replaceGoogleDeveloper(w,config,b.expectedUpdatedAt)});
 }
 if(b.action==="enable"&&typeof b.enabled==="boolean")return reply({workspaceId:w,status:await enableGoogleDeveloper(w,b.enabled)});
 return reply({error:"Unsupported configuration action"},400);
 }catch(e){if(e instanceof GoogleStorageVerificationError)return reply({error:e.message},503);if(e instanceof GoogleReplacementBlocked)return reply({error:e.message},409);return reply({error:"Google configuration could not be confirmed. Check vault readiness, application identity, storage migration and master activation gate. Retry the same credentials without resetting."},503);}
}
