import {handleCallback} from "@vercel/queue";
import {stageEnabled} from "@/lib/social-contract";
import {consumeDryRun,validDryPayload} from "@/lib/social-native-queue";
export const runtime="nodejs";
const callback=handleCallback(async (payload:unknown)=>{
 if(!stageEnabled(process.env))throw Error("Queue consumer cannot run outside the isolated Social Intelligence staging branch");
 if(!validDryPayload(payload))throw Error("Invalid queue payload");
 // This is intentionally database-only. Never call social provider APIs in a queue handler.
 await consumeDryRun(payload);
});
export async function POST(request:Request){return callback({request});}
