import {NextRequest,NextResponse} from "next/server";
import {sameOrigin} from "@/lib/portal-auth";
import {customerIdentityFromRequest} from "@/lib/reach-customer-auth";
import {acceptCustomerInvitation,invitesAvailable} from "@/lib/reach-customer-invitations";
export const runtime="nodejs";export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return reply({error:"Invalid request origin"},403);
 if(process.env.VERCEL_ENV!=="preview"||!invitesAvailable())return reply({error:"Staging invitations disabled"},503);
 const identity=customerIdentityFromRequest(req);
 if(!identity)return reply({error:"Verified customer sign-in required"},401);
 if(Number(req.headers.get("content-length")||"0")>300)return reply({error:"Invalid invitation request"},413);
 let raw:unknown;try{raw=await req.json();}catch{return reply({error:"Invalid invitation request"},400);}
 const token=raw&&typeof raw==="object"&&!Array.isArray(raw)&&"token" in raw?(raw as {token:unknown}).token:null;
 if(typeof token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(token))return reply({error:"Invalid invitation token"},400);
 try{
  const accepted=await acceptCustomerInvitation(identity,token);
  return accepted?reply({accepted:true,requiresNewWorkspaceFetch:true},200):
   reply({error:"Invitation expired, already accepted, or not addressed to this verified email"},409);
 }catch{return reply({error:"Invitation redemption unavailable"},503);}
}
