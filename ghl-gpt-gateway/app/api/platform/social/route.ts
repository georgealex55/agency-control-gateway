import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {parseSocialInput,validId} from "@/lib/social-contract";
import {listSocialPosts,createSocialPost} from "@/lib/social-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);
 if(!workspaceId)return reply({error:"Valid workspace ID required"},400);
 try{return reply({...await listSocialPosts(workspaceId),publishingEnabled:false});}
 catch{return reply({error:"Unable to read social drafts"},503);}
}
export async function POST(req:NextRequest){
 const denied=gate(req,true);if(denied)return denied;
 let raw:unknown;try{raw=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
 const data=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 if(!data||!validId(data.workspaceId))return reply({error:"Valid workspace ID required"},400);
 let input;try{input=parseSocialInput(data);}catch(e){return reply({error:e instanceof Error?e.message:"Invalid social draft"},400);}
 try{const post=await createSocialPost(data.workspaceId,input);return post?reply({post,published:false},201):reply({error:"Workspace not found"},404);}
 catch{return reply({error:"Unable to save social draft"},503);}
}
