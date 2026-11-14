import { NextRequest, NextResponse } from "next/server";
import { adminAuthenticated, sameOrigin } from "@/lib/portal-auth";
import { createPlatformWorkspace, listPlatformWorkspaces, platformStorageConfigured, validBusinessType, validSlug, validWorkspaceName } from "@/lib/platform-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
function reply(value:unknown,status=200){return NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});}
export async function GET(req:NextRequest){
  if(!adminAuthenticated(req))return reply({error:"Administrator login required"},401);
  if(!platformStorageConfigured())return reply({configured:false,workspaces:[],message:"A separate platform database is not configured"});
  try{return reply({configured:true,workspaces:await listPlatformWorkspaces()});}
  catch{return reply({error:"Platform database unavailable"},503);}
}
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return reply({error:"Invalid request origin"},403);
  if(!adminAuthenticated(req))return reply({error:"Administrator login required"},401);
  if(!platformStorageConfigured())return reply({error:"Platform database is not configured"},503);
  let body:unknown;try{body=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
  if(!body||typeof body!=="object"||Array.isArray(body))return reply({error:"Invalid request"},400);
  const {name,slug,businessType}=body as Record<string,unknown>;
  if(!validWorkspaceName(name)||!validSlug(slug)||!validBusinessType(businessType))return reply({error:"Invalid name, slug or business type"},400);
  try{return reply({ok:true,workspace:await createPlatformWorkspace({name:name.trim(),slug,businessType})},201);}
  catch(e){
    if(e&&typeof e==="object"&&"code" in e&&e.code==="23505")return reply({error:"Workspace slug already exists"},409);
    return reply({error:"Unable to create workspace"},503);
  }
}
