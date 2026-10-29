import { NextRequest, NextResponse } from "next/server";
import { adminAuthenticated, sameOrigin } from "@/lib/portal-auth";
import { isModuleKey, platformStorageConfigured, setModulePlan, validWorkspaceId } from "@/lib/platform-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
function reply(value:unknown,status=200){return NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});}
export async function PUT(req:NextRequest,ctx:{params:Promise<{id:string}>}){
  if(!sameOrigin(req))return reply({error:"Invalid request origin"},403);
  if(!adminAuthenticated(req))return reply({error:"Administrator login required"},401);
  if(!platformStorageConfigured())return reply({error:"Platform database not configured"},503);
  const {id}=await ctx.params;
  if(!validWorkspaceId(id))return reply({error:"Invalid workspace identifier"},400);
  let body:unknown;try{body=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
  if(!body||typeof body!=="object"||Array.isArray(body))return reply({error:"Invalid request"},400);
  const {module,state}=body as Record<string,unknown>;
  if(!isModuleKey(module)||!(state==="hidden"||state==="planned"))return reply({error:"Invalid module or plan state"},400);
  try{
    const exists=await setModulePlan(id,module,state);
    return exists?reply({ok:true,module,state,clientAccessGranted:false,billingActivated:false}):reply({error:"Workspace not found"},404);
  }catch{return reply({error:"Module plan update unavailable"},503);}
}
