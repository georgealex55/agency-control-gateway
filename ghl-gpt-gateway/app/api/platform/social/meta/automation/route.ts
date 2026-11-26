import {NextRequest} from "next/server";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {validUUID,parseActionDraft,metaAutomationFlags} from "@/lib/social-meta-automation-contract";
import {createMetaAction,listMetaActions,transitionMetaAction,inboundMetaEvents} from "@/lib/social-meta-automation-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);if(!workspaceId)return reply({error:"Select your business workspace"},400);
 try{
  const [actions,inbox]=await Promise.all([listMetaActions(workspaceId),inboundMetaEvents(workspaceId)]);
  return reply({workspaceId,actions,inbox,flags:metaAutomationFlags(),externalPublishing:false,
   description:"Drafts and approvals are saved; nothing is published by listing or creating an action."});
 }catch{return reply({error:"Meta automation storage is not ready; no accounts were changed."},503);}
}
export async function POST(req:NextRequest){
 const denied=connectionGate(req,true);if(denied)return denied;
 let input:unknown;try{input=await req.json();}catch{return reply({error:"Invalid action"},400);}
 const draft=parseActionDraft(input);
 if(!draft)return reply({error:"Select a connected account, provide valid content and a valid scheduled time"},400);
 try{
  const action=await createMetaAction(draft);
  return action?reply({action,requiresApproval:true,externalPublishing:false},201):
   reply({error:"Account unavailable, request already used for another account, or hourly limit reached"},409);
 }catch{return reply({error:"Unable to save draft. No content was sent."},503);}
}
export async function PATCH(req:NextRequest){
 const denied=connectionGate(req,true);if(denied)return denied;
 let data:unknown;try{data=await req.json();}catch{return reply({error:"Invalid approval"},400);}
 const p=data&&typeof data==="object"&&!Array.isArray(data)?data as Record<string,unknown>:null;
 if(!p||!validId(p.workspaceId)||!validUUID(p.actionId)||!["approve","cancel"].includes(String(p.transition))||
  p.confirm!==true)return reply({error:"Explicit action confirmation required"},400);
 try{
  const action=await transitionMetaAction(p.workspaceId,p.actionId,p.transition as "approve"|"cancel");
  return action?reply({action,externalPublishing:false}):reply({error:"Action has already moved to another state"},409);
 }catch{return reply({error:"Action could not be updated"},503);}
}
