import {NextRequest} from "next/server";
import {connectionGate,reply} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {validUUID} from "@/lib/social-meta-automation-contract";
import {claimMetaActions,finalizeMetaAction} from "@/lib/social-meta-automation-store";
import {deliverMetaAction,MetaDeliveryError} from "@/lib/social-meta-automation-provider";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function POST(req:NextRequest){
 const denied=connectionGate(req,true);if(denied)return denied;
 if(process.env.SOCIAL_META_LIVE_DELIVERY_ENABLED!=="true")return reply({error:"Live sending is disabled; your approved drafts remain safe."},423);
 let value:unknown;try{value=await req.json();}catch{return reply({error:"Invalid request"},400);}
 const p=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
 if(!p||!validId(p.workspaceId)||!validUUID(p.actionId)||p.confirm!==true)return reply({error:"Select and explicitly confirm one approved action"},400);
 try{
  const claimed=await claimMetaActions(p.workspaceId,p.actionId,1);
  const action=claimed[0];
  if(!action)return reply({error:"Action is not approved, not due, already sent, or unavailable"},409);
  try{
   const result=await deliverMetaAction(action);
   await finalizeMetaAction(action.workspaceId,action.id,{status:"sent",externalRef:result.externalRef});
   return reply({status:"sent",actionId:action.id,externalRef:result.externalRef,externalPublishing:true});
  }catch(e){
   const known=e instanceof MetaDeliveryError;
   const blocked=known&&["PERMISSION_UNVERIFIED","PERMISSION_MISSING","ACCOUNT_MISMATCH",
    "TARGET_NOT_AUTHORIZED","FEATURE_DISABLED"].includes(e.code);
   await finalizeMetaAction(action.workspaceId,action.id,{status:blocked?"blocked":"uncertain",
    errorCode:known?e.code:"META_UNAVAILABLE"});
   return reply({error:blocked?"Permission or recipient authorization missing; reconnect or review.":
    "Meta did not confirm delivery. Do not resend until you check the account.",
    status:blocked?"blocked":"uncertain",actionId:action.id},blocked?403:502);
  }
 }catch{return reply({error:"Delivery state unavailable. No retry will be attempted automatically."},503);}
}
