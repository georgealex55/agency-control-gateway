import {NextRequest} from "next/server";
import {reply} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {secureEqual} from "@/lib/social-meta-automation-contract";
import {claimMetaActions,finalizeMetaAction} from "@/lib/social-meta-automation-store";
import {deliverMetaAction,MetaDeliveryError} from "@/lib/social-meta-automation-provider";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function GET(req:NextRequest){
 const env=process.env;
 if(env.VERCEL_ENV!=="production"||env.SOCIAL_META_AUTO_POST_ENABLED!=="true"||env.SOCIAL_META_LIVE_DELIVERY_ENABLED!=="true")
  return reply({enabled:false,processed:0});
 const secret=env.CRON_SECRET||"";
 if(secret.length<24||!secureEqual(req.headers.get("authorization")||"","Bearer "+secret))
  return reply({error:"Unauthorized scheduled delivery"},401);
 const workspaceId=env.REACH_SOCIAL_OWNER_WORKSPACE_ID;
 if(!validId(workspaceId)||env.REACH_SOCIAL_OWNER_STORAGE_ENABLED!=="true")
  return reply({error:"Scheduled delivery requires isolated owner storage"},503);
 try{
  const actions=await claimMetaActions(workspaceId,undefined,3);
  let sent=0,blocked=0,uncertain=0;
  for(const action of actions){
   try{
    const result=await deliverMetaAction(action);
    if(await finalizeMetaAction(action.workspaceId,action.id,{status:"sent",externalRef:result.externalRef}))sent++;
   }catch(e){
    const c=e instanceof MetaDeliveryError?e.code:"META_UNAVAILABLE";
    const isBlocked=["PERMISSION_UNVERIFIED","PERMISSION_MISSING","ACCOUNT_MISMATCH","TARGET_NOT_AUTHORIZED","FEATURE_DISABLED"].includes(c);
    await finalizeMetaAction(action.workspaceId,action.id,{status:isBlocked?"blocked":"uncertain",errorCode:c});
    if(isBlocked)blocked++;else uncertain++;
   }
  }
  return reply({processed:actions.length,sent,blocked,uncertain,externalPublishingEnabled:true});
 }catch{return reply({error:"Scheduled delivery unavailable. No additional retries attempted."},503);}
}
