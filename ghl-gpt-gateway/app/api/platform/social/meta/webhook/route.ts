import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {resolvedMetaEnv} from "@/lib/reach-meta-app-vault";
import {metaWebhookConnection,recordMetaInbound} from "@/lib/social-meta-automation-store";
import {validMetaId,secureEqual} from "@/lib/social-meta-automation-contract";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
const json=(x:unknown,s=200)=>NextResponse.json(x,{status:s,headers:{"Cache-Control":"no-store"}});
function validSignature(body:Buffer,signature:string,secret:string){
 if(!/^sha256=[0-9a-f]{64}$/i.test(signature)||secret.length<8)return false;
 const want=createHmac("sha256",secret).update(body).digest("hex");
 return timingSafeEqual(Buffer.from(want,"hex"),Buffer.from(signature.slice(7),"hex"));
}
const dict=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
const stamp=(v:unknown):string=>{
 const millis=typeof v==="number"&&v>0?(v>1e12?v:v*1000):Date.now();
 return new Date(Math.min(Date.now()+60000,Math.max(Date.now()-48*3600*1000,millis))).toISOString();
};
export async function GET(req:NextRequest){
 const env=process.env,verify=env.SOCIAL_META_WEBHOOK_VERIFY_TOKEN||"";
 if(verify.length<24)return json({error:"Webhook verification not configured"},503);
 const mode=req.nextUrl.searchParams.get("hub.mode"),token=req.nextUrl.searchParams.get("hub.verify_token")||"";
 const challenge=req.nextUrl.searchParams.get("hub.challenge")||"";
 if(mode!=="subscribe"||!secureEqual(token,verify)||!/^[-_A-Za-z0-9]{1,256}$/.test(challenge))
  return json({error:"Invalid webhook verification"},403);
 return new NextResponse(challenge,{status:200,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
}
/** Signature-checked inbound receipts only. Never automatically reply to Meta
 * events or persist the raw message body. Unknown accounts are discarded. */
export async function POST(req:NextRequest){
 const env=process.env;
 if(env.VERCEL_ENV!=="production"||!env.REACH_SOCIAL_OWNER_WORKSPACE_ID||
  env.SOCIAL_META_WEBHOOKS_ENABLED!=="true")return json({error:"Webhooks not enabled"},503);
 const max=96*1024,len=Number(req.headers.get("content-length")||"0");
 if(len>max)return json({error:"Payload too large"},413);
 const bytes=Buffer.from(await req.arrayBuffer());
 if(bytes.length>max||bytes.length===0)return json({error:"Invalid webhook payload"},413);
 const signature=req.headers.get("x-hub-signature-256")||"";
 const providers=["facebook_pages","instagram_professional"] as const;
 const envs=await Promise.all(providers.map(x=>resolvedMetaEnv(x)));
 const valid=envs.some((x,i)=>{
  const key=i===0?x.SOCIAL_META_FACEBOOK_CLIENT_SECRET:x.SOCIAL_META_INSTAGRAM_CLIENT_SECRET;
  return typeof key==="string"&&validSignature(bytes,signature,key);
 });
 if(!valid)return json({error:"Invalid signature"},401);
 let raw:unknown;try{raw=JSON.parse(bytes.toString("utf8"));}catch{return json({error:"Invalid JSON"},400);}
 const body=dict(raw),object=body?.object;
 if(object!=="page"&&object!=="instagram")return json({accepted:true,matched:0});
 const provider=object==="page"?"facebook_pages":"instagram_professional";
 const list=body?.entry;
 if(!Array.isArray(list)||list.length>20)return json({error:"Invalid webhook entries"},400);
 const workspaceId=env.REACH_SOCIAL_OWNER_WORKSPACE_ID;
 let matched=0;
 try{
  for(const rawEntry of list){
   const entry=dict(rawEntry),accountId=entry?.id;
   if(!validMetaId(accountId)||String(accountId).includes("_"))continue;
   const connectionId=await metaWebhookConnection(workspaceId,provider,accountId);
   if(!connectionId)continue;
   const changes=Array.isArray(entry?.changes)?entry.changes.slice(0,30):[];
   const messaging=Array.isArray(entry?.messaging)?entry.messaging.slice(0,30):[];
   const events:{type:"comment"|"message";target:string|null;sender:string|null;time:string;key:string}[]=[];
   for(const c of changes){
    const v=dict(c),value=dict(v?.value),field=v?.field;
    if(field!=="comments"&&field!=="feed")continue;
    const id=value?.comment_id??(value?.item==="comment"?value?.post_id:null)??value?.id;
    if(!validMetaId(id))continue;
    const sender=dict(value?.from)?.id??null;
    events.push({type:"comment",target:id,sender:validMetaId(sender)?sender:null,time:stamp(entry?.time),
     key:String(id)+":"+String(entry?.time||"")});
   }
   for(const e of messaging){
    const v=dict(e),m=dict(v?.message),sender=dict(v?.sender)?.id;
    if(m?.is_echo===true||!validMetaId(sender)||sender===accountId)continue;
    const msgId=m?.mid;
    if(typeof msgId!=="string"||msgId.length<8||msgId.length>240)continue;
    events.push({type:"message",target:null,sender,time:stamp(v?.timestamp??entry?.time),key:msgId});
   }
   for(const event of events.slice(0,30)){
    const hash=createHash("sha256").update(provider+":"+accountId+":"+event.type+":"+event.key).digest("hex");
    if(await recordMetaInbound({workspaceId,connectionId,eventHash:hash,type:event.type,targetId:event.target,
     senderId:event.sender,occurredAt:event.time}))matched++;
   }
  }
  return json({accepted:true,matched});
 }catch{return json({error:"Webhook delivery could not be recorded. No automated response was sent."},503);}
}
