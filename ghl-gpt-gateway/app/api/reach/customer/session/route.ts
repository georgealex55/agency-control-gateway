import {NextRequest,NextResponse} from "next/server";
import {sameOrigin} from "@/lib/portal-auth";
import {customerAuthConfig,customerCookieLifetime,customerCookieName,
 createCustomerSession,customerIdentityFromRequest,verifyCustomerAssertion} from "@/lib/reach-customer-auth";
import {customerDatabaseConfigured,listCustomerWorkspaces} from "@/lib/reach-customer-access";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict" as const,path:"/"};
export async function GET(req:NextRequest){
 if(!customerAuthConfig()||!customerDatabaseConfigured())return reply({authenticated:false,configured:false},503);
 const identity=customerIdentityFromRequest(req);
 if(!identity)return reply({authenticated:false,configured:true},401);
 try{
  const workspaces=await listCustomerWorkspaces(identity);
  if(workspaces.length===0)return reply({authenticated:false,configured:true},403);
  return reply({authenticated:true,configured:true,workspaceCount:workspaces.length,readOnly:true});
 }catch{return reply({authenticated:false,configured:false},503);}
}
/** Neon Auth issues the asserted JWT. Neither the owner session cookie nor
 * client-supplied role/workspace ID can create a customer session.
 */
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return reply({error:"Invalid request origin"},403);
 const config=customerAuthConfig();
 if(!config||!customerDatabaseConfigured())return reply({error:"Customer sign-in not configured"},503);
 if(Number(req.headers.get("content-length")||"0")>9000)return reply({error:"Invalid authentication request"},413);
 let raw:unknown;try{raw=await req.json();}catch{return reply({error:"Invalid authentication request"},400);}
 const assertion=raw&&typeof raw==="object"&&!Array.isArray(raw)&&"assertion" in raw?(raw as {assertion:unknown}).assertion:null;
 if(typeof assertion!=="string"||assertion.length>8192)return reply({error:"Invalid authentication request"},400);
 try{
  const identity=await verifyCustomerAssertion(assertion,config);
  const membership=await listCustomerWorkspaces(identity);
  if(!membership.length)return reply({error:"No authorized REACH workspace"},403);
  const response=reply({authenticated:true,workspaceCount:membership.length,readOnly:true});
  response.cookies.set(customerCookieName(),createCustomerSession(identity,config.sessionSecret),{...cookieOptions,maxAge:customerCookieLifetime()});
  return response;
 }catch{return reply({error:"Customer sign-in could not be verified"},401);}
}
export async function DELETE(req:NextRequest){
 if(!sameOrigin(req))return reply({error:"Invalid request origin"},403);
 const response=reply({authenticated:false});
 response.cookies.set(customerCookieName(),"",{...cookieOptions,maxAge:0});
 return response;
}
