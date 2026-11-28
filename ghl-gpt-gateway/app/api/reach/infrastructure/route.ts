import {NextRequest} from "next/server";
import {randomUUID} from "node:crypto";
import {connectionGate,reply,workspaceFromQuery} from "@/lib/social-api";
import {ownerSocialStorageConfigured,socialMetaWorkspaceDb} from "@/lib/reach-social-owner-db";
import {validId} from "@/lib/social-contract";
import {normalizeDomain,safeCount,domainDns,domainIntelligence} from "@/lib/reach-infrastructure";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=30;
const allowed=(workspace:string|null):workspace is string=>Boolean(workspace&&ownerSocialStorageConfigured()&&workspace===process.env.REACH_SOCIAL_OWNER_WORKSPACE_ID);
type Domain={id:string;hostname:string;created_at:string};
const rows=<T,>(v:unknown):T[]=>{if(!Array.isArray(v))throw Error("Unexpected database result");return v as T[];};
const listSql="SELECT id,hostname,created_at FROM public.agency_platform_domains WHERE workspace_id=$1::uuid ORDER BY created_at DESC LIMIT 100";
export async function GET(req:NextRequest){
 const denied=connectionGate(req);if(denied)return denied;
 const workspace=workspaceFromQuery(req);if(!allowed(workspace))return reply({error:"Approved owner production storage required"},428);
 const kind=req.nextUrl.searchParams.get("kind");
 if(kind!=="domains"&&kind!=="database")return reply({error:"Unknown infrastructure report"},400);
 const started=Date.now();
 try{
  const db=await socialMetaWorkspaceDb(workspace);
  if(kind==="domains"){
   const domains=rows<Domain>(await db.query(listSql,[workspace]));
   const id=req.nextUrl.searchParams.get("domainId");
   if(id!==null){
    if(!validId(id))return reply({error:"Invalid domain"},400);
    const selected=domains.find(d=>d.id===id);if(!selected)return reply({error:"Domain not registered in this workspace"},404);
    return reply({workspaceId:workspace,domainId:id,hostname:selected.hostname,dns:await (req.nextUrl.searchParams.get("detail")==="1"?domainIntelligence(selected.hostname,id):domainDns(selected.hostname,id)),readOnly:true});
   }
   return reply({workspaceId:workspace,domains:domains.map(d=>({id:d.id,hostname:d.hostname,createdAt:d.created_at})),readOnly:true});
  }
  const primary=rows<{database:string;bytes:string|number;tables:string|number;rls:boolean}>(await db.query("SELECT current_database() AS database, pg_database_size(current_database()) AS bytes, (SELECT count(*) FROM pg_catalog.pg_stat_user_tables) AS tables, (SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_catalog.pg_class WHERE oid IN ('public.agency_platform_workspaces'::regclass,'public.agency_platform_domains'::regclass,'public.agency_social_meta_connections'::regclass,'public.agency_social_meta_actions'::regclass,'public.agency_social_meta_webhook_events'::regclass)) AS rls"));
  const p=primary[0];if(!p||p.database!=="reach_platform")throw Error("Unexpected database");
  const latencyMs=Date.now()-started;
  const storage=await db.query("SELECT relname AS name, pg_total_relation_size(relid) AS bytes FROM pg_catalog.pg_stat_user_tables WHERE schemaname='public' ORDER BY bytes DESC LIMIT 10").then(v=>rows<{name:string;bytes:string|number}>(v).map(x=>({name:x.name,bytes:safeCount(x.bytes)}))).catch(()=>null);
  return reply({workspaceId:workspace,provider:"neon",status:"connected",database:p.database,bytes:safeCount(p.bytes),tableCount:safeCount(p.tables),latencyMs,forcedRls:p.rls===true,storage,checkedAt:new Date().toISOString(),readOnly:true,quotaBytes:null});
 }catch{return reply({error:"Infrastructure check unavailable. No connections were changed."},503);}
}
export async function POST(req:NextRequest){
 const denied=connectionGate(req,true);if(denied)return denied;
 try{
  const body=await req.json();const workspace=body?.workspaceId,hostname=normalizeDomain(body?.hostname);
  if(!validId(workspace)||!allowed(workspace)||!hostname||body?.confirm!==true)return reply({error:"Confirm a valid domain in the approved owner workspace"},400);
  const db=await socialMetaWorkspaceDb(workspace);
  const result=rows<Domain>(await db.query("INSERT INTO public.agency_platform_domains(id,workspace_id,hostname,verified) SELECT $1::uuid,w.id,$3,false FROM public.agency_platform_workspaces w WHERE w.id=$2::uuid AND (SELECT count(*) FROM public.agency_platform_domains WHERE workspace_id=$2::uuid)<100 ON CONFLICT(hostname) DO NOTHING RETURNING id,hostname,created_at",[randomUUID(),workspace,hostname]));
  if(!result.length)return reply({error:"Domain already registered or registry limit reached"},409);
  return reply({workspaceId:workspace,domain:{id:result[0].id,hostname:result[0].hostname,createdAt:result[0].created_at},dnsChanged:false},201);
 }catch{return reply({error:"Domain registration unavailable. No DNS changes made."},503);}
}
