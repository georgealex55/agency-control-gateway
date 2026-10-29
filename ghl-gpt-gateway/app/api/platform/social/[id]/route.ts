import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {parseSocialInput,validId} from "@/lib/social-contract";
import {updateSocialPost,deleteSocialPost} from "@/lib/social-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function PUT(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const denied=gate(req,true);if(denied)return denied;
 const {id}=await params;if(!validId(id))return reply({error:"Invalid social draft ID"},400);
 let raw:unknown;try{raw=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
 const o=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 if(!o||!validId(o.workspaceId))return reply({error:"Workspace ID required"},400);
 let input;try{input=parseSocialInput(o);}catch(e){return reply({error:e instanceof Error?e.message:"Invalid draft"},400);}
 try{const post=await updateSocialPost(o.workspaceId,id,input);return post?reply({post,published:false}):reply({error:"Draft not found for this workspace"},404);}
 catch{return reply({error:"Unable to update social draft"},503);}
}
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const denied=gate(req,true);if(denied)return denied;
 const {id}=await params,workspaceId=workspaceFromQuery(req);
 if(!validId(id)||!workspaceId)return reply({error:"Invalid workspace or draft ID"},400);
 try{return await deleteSocialPost(workspaceId,id)?reply({deleted:true,published:false}):reply({error:"Draft not found for this workspace"},404);}
 catch{return reply({error:"Unable to remove social draft"},503);}
}
