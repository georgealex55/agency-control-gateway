import {NextRequest} from "next/server";
import {gate,reply} from "@/lib/social-api";
import {validId} from "@/lib/social-contract";
import {validEngine} from "@/lib/upstream-engine-contract";
import {checkUpstreamEngine} from "@/lib/upstream-engine-readers";
import {readySql} from "@/lib/platform-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const denied=gate(req,true);if(denied)return denied;
 let raw:unknown;try{raw=await req.json();}catch{return reply({error:"Invalid JSON"},400);}
 const v=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 if(!v||!validId(v.workspaceId)||!validEngine(v.engine))return reply({error:"Valid workspace and engine required"},400);
 try{
  const sql=await readySql();
  const found=await sql.query("SELECT id FROM agency_platform_workspaces WHERE id=$1::uuid",[v.workspaceId]);
  const rows=Array.isArray(found)?found:(found&&typeof found==="object"&&"rows" in found?found.rows:[]);
  if(!Array.isArray(rows)||rows.length!==1)return reply({error:"Workspace not found"},404);
  const result=await checkUpstreamEngine(v.engine,v.workspaceId,process.env);
  await sql.query("INSERT INTO agency_platform_audit_events(workspace_id,action,detail) VALUES($1::uuid,'upstream.engine.checked',jsonb_build_object('engine',$2,'status',$3))",[v.workspaceId,v.engine,result.state]);
  return reply(result);
 }catch{return reply({error:"Integration check unavailable"},503);}
}
