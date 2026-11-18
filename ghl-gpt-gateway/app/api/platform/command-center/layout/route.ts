import {NextRequest,NextResponse} from "next/server";
import {adminAuthenticated,sameOrigin} from "@/lib/portal-auth";
import {validWorkspaceId} from "@/lib/platform-validation";
import {commandLayoutStage,commandApprovedStorageConfigured,getCommandLayout,saveCommandLayout} from "@/lib/reach-command-layout-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
function reply(payload:unknown,status=200){return NextResponse.json(payload,{status,headers:{"Cache-Control":"private, no-store"}});}
function authorize(req:NextRequest,write=false){
 if(!adminAuthenticated(req))return reply({error:"Owner sign-in required"},401);
 if(!commandLayoutStage())return reply({error:"Command Center layout is preview-only"},403);
 if(!commandApprovedStorageConfigured())return reply({error:"Isolated staging database approval is required"},428);
 if(write&&!sameOrigin(req))return reply({error:"Invalid request origin"},403);
 return null;
}
export async function GET(req:NextRequest){
 const blocked=authorize(req);if(blocked)return blocked;
 const workspaceId=req.nextUrl.searchParams.get("workspaceId");
 if(!validWorkspaceId(workspaceId))return reply({error:"Valid workspace ID required"},400);
 try{
  const value=await getCommandLayout(workspaceId);
  if(!value.found)return reply({error:"Workspace not found or storage unavailable"},404);
  return reply({workspaceId,...value});
 }catch{return reply({error:"Dashboard layout unavailable"},503);}
}
export async function PUT(req:NextRequest){
 const blocked=authorize(req,true);if(blocked)return blocked;
 const workspaceId=req.nextUrl.searchParams.get("workspaceId");
 if(!validWorkspaceId(workspaceId))return reply({error:"Valid workspace ID required"},400);
 if(Number(req.headers.get("content-length")||0)>4096)return reply({error:"Layout payload too large"},413);
 let body:unknown;try{body=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
 if(!body||typeof body!=="object"||Array.isArray(body))return reply({error:"Invalid layout"},400);
 const data=body as Record<string,unknown>;
 if(JSON.stringify(data).length>4096)return reply({error:"Layout payload too large"},413);
 try{
  const saved=await saveCommandLayout(workspaceId,data.layout,data.expectedRevision);
  if(saved.status==="invalid")return reply({error:"Invalid dashboard layout or revision"},400);
  if(saved.status==="disabled")return reply({error:"Layout saving not enabled for this preview"},403);
  if(saved.status==="not_found")return reply({error:"Workspace not found"},404);
  if(saved.status==="conflict")return reply({error:"Layout changed in another session; refresh before saving"},409);
  return reply({workspaceId,saveEnabled:true,...saved});
 }catch{return reply({error:"Unable to save dashboard layout"},503);}
}
