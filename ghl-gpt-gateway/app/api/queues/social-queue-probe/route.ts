import {handleCallback} from "@vercel/queue";
import {stageEnabled} from "@/lib/social-contract";
import {acknowledgeQueueProbe} from "@/lib/social-queue-probe-store";
import {validQueueProbePayload} from "@/lib/social-queue-probe-contract";
export const runtime="nodejs";
const callback=handleCallback(async(payload:unknown)=>{
 if(!stageEnabled(process.env))throw Error("Queue probe requires the isolated preview branch");
 if(!validQueueProbePayload(payload))throw Error("Invalid queue probe message");
 // Private callback: database acknowledgement ONLY. No social provider calls.
 await acknowledgeQueueProbe(payload);
});
export async function POST(request:Request){return callback({request});}
