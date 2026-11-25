import {NextRequest,NextResponse} from "next/server";
import {sameOrigin} from "@/lib/portal-auth";
import {customerAuthConfig,customerCookieLifetime,customerCookieName,
 createCustomerSession,customerIdentityFromRequest,verifyCustomerAssertion} from "@/lib/reach-customer-auth";
import {customerDatabaseConfigured,listCustomerWorkspaces} from "@/lib/reach-customer-access";
import {customerNeonAuth} from "@/lib/reach-customer-neon-auth";
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
  // A verified invited identity with no membership may accept a pending invite.
  // The workspace API still returns nothing until an owner-created grant exists.
  return reply({authenticated:true,configured:true,workspaceCount:workspaces.length,readOnly:true});
 }catch{return reply({authenticated:false,configured:false},503);}
}
/** Exchange a *server-resolved* Neon Auth session for a separate short-lived
 * REACH customer cookie. No browser-provided assertion, user ID, workspace
 * claim or role is ever accepted here.
 */
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return reply({error:"Invalid request origin"},403);
 const config=customerAuthConfig();
 if(!config||!customerDatabaseConfigured()||!customerNeonAuth)return reply({error:"Customer sign-in not configured"},503);
 if(Number(req.headers.get("content-length")||"0")>256)return reply({error:"Invalid authentication request"},413);
 try{
  // Neon Auth's getSession().session.token is an opaque cookie identifier.
  // The token() JWT plugin instead signs an EdDSA assertion for the current
  // managed session, resolving its cookies on the server.
  const result=await customerNeonAuth.token();
  const assertion=result?.data?.token;
  if(typeof assertion!=="string"||assertion.split(".").length!==3)
   return reply({error:"Verified Neon Auth session required"},401);
  const identity=await verifyCustomerAssertion(assertion,config);
  const membership=await listCustomerWorkspaces(identity);
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
