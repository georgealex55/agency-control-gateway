import {NextRequest,NextResponse} from "next/server";
import {adminAuthenticated,sameOrigin} from "@/lib/portal-auth";
import {invitesAvailable,issueCustomerInvitation,listInvitableWorkspaces} from "@/lib/reach-customer-invitations";
import {isCustomerRole,workspaceIsValid} from "@/lib/reach-customer-access";
export const runtime="nodejs";export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return reply({error:"Invalid request origin"},403);
 if(!adminAuthenticated(req))return reply({error:"Platform owner sign-in required"},401);
 if(process.env.VERCEL_ENV!=="preview"||!invitesAvailable())return reply({error:"Staging invitations disabled"},503);
 if(Number(req.headers.get("content-length")||"0")>1200)return reply({error:"Invalid invitation request"},413);
 let raw:unknown;try{raw=await req.json();}catch{return reply({error:"Invalid invitation request"},400);}
 const a=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 if(!a||!workspaceIsValid(a.workspaceId)||typeof a.email!=="string"||
  a.email.length>254||!isCustomerRole(a.role))return reply({error:"Invalid invitation details"},400);
 try{
  const token=await issueCustomerInvitation({workspaceId:a.workspaceId,email:a.email,role:a.role});
  return reply({invitePath:"/customer/invite?token="+encodeURIComponent(token),
   expiresInHours:48,delivery:"manual_only",emailSent:false},201);
 }catch{return reply({error:"Invitation could not be created"},503);}
}
