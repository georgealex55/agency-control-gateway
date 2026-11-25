import {NextRequest,NextResponse} from "next/server";
import {customerAuthConfig,customerIdentityFromRequest} from "@/lib/reach-customer-auth";
import {customerDatabaseConfigured,listCustomerWorkspaces,requireCustomerWorkspace} from "@/lib/reach-customer-access";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
/** Customer view is never authorized by `agency_portal_session`.
 * Membership and role are freshly resolved by the database on every request.
 */
export async function GET(req:NextRequest){
 if(!customerAuthConfig()||!customerDatabaseConfigured())return reply({error:"Customer access not configured"},503);
 const identity=customerIdentityFromRequest(req);
 if(!identity)return reply({error:"Customer sign-in required"},401);
 try{
  const requested=req.nextUrl.searchParams.get("workspaceId");
  if(requested!==null){
   const allowed=await requireCustomerWorkspace(identity,requested,"workspace:read");
   return allowed?reply({workspace:allowed,readOnly:true,publishingEnabled:false}):reply({error:"Workspace unavailable"},404);
  }
  const workspaces=await listCustomerWorkspaces(identity);
  return reply({workspaces,readOnly:true,publishingEnabled:false});
 }catch{return reply({error:"Customer workspace access unavailable"},503);}
}
