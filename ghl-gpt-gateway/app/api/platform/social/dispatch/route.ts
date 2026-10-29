import {send} from "@vercel/queue";
import {NextRequest} from "next/server";
import {gate,reply} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {prepareDueJobs,markQueued,SOCIAL_DRY_TOPIC} from "@/lib/social-native-queue";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const denied=gate(req,true);if(denied)return denied;
 let input:unknown;try{input=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
 const o=input&&typeof input==="object"&&!Array.isArray(input)?input as Record<string,unknown>:null;
 if(!o||!validId(o.workspaceId))return reply({error:"Workspace ID required"},400);
 try{
  const {jobs,total}=await prepareDueJobs(o.workspaceId);
  let submitted=0,failed=0;
  for(const job of jobs){
   try{
    await send(SOCIAL_DRY_TOPIC,{jobId:job.id,workspaceId:job.workspaceId,postId:job.postId},{idempotencyKey:job.id,retentionSeconds:3600});
    await markQueued(job.id,job.workspaceId);
    submitted++;
   }catch{failed++;}
  }
  return reply({mode:"dry-run",externalPublishing:false,submitted,failed,pendingBeforeRun:total,queue:"Vercel Queues",note:"This checks only due approved content. No social API is called."});
 }catch{return reply({error:"Staging due-job dispatch unavailable"},503);}
}
