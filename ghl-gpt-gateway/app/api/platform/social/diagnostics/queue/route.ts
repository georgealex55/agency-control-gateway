import {send} from "@vercel/queue";
import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {SOCIAL_PROBE_TOPIC,type QueueProbePayload} from "@/lib/social-queue-probe-contract";
import {createQueueProbe,listQueueProbes,markQueueProbeSent,markQueueProbeSendFailed} from "@/lib/social-queue-probe-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);if(!workspaceId)return reply({error:"Valid workspace ID required"},400);
 try{return reply({probes:await listQueueProbes(workspaceId),providerPublishing:false});}
 catch{return reply({error:"Queue delivery probes unavailable"},503);}
}
export async function POST(req:NextRequest){
 const denied=gate(req,true);if(denied)return denied;
 let raw:unknown;try{raw=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
 const body=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 if(!body||!validId(body.workspaceId))return reply({error:"Valid workspace ID required"},400);
 try{
  const probe=await createQueueProbe(body.workspaceId);
  if(!probe)return reply({error:"Workspace not found or queue check already started this minute"},409);
  const payload:QueueProbePayload={probeId:probe.id,workspaceId:probe.workspaceId};
  try{
   await send(SOCIAL_PROBE_TOPIC,payload,{idempotencyKey:probe.id,retentionSeconds:3600});
   await markQueueProbeSent(payload);
   return reply({probeId:probe.id,status:"sent",deliveryConfirmed:false,externalPublishing:false},202);
  }catch{
   await markQueueProbeSendFailed(payload).catch(()=>{});
   return reply({probeId:probe.id,status:"send_failed",deliveryConfirmed:false,externalPublishing:false,error:"Vercel Queue rejected the diagnostic message"},503);
  }
 }catch{return reply({error:"Queue diagnostic setup unavailable"},503);}
}
