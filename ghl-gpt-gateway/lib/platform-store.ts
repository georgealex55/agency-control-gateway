import { neon } from "@neondatabase/serverless";
import { randomUUID } from "crypto";
import { MODULES, type ModuleKey } from "@/lib/agency-platform";

export type ModulePlan = "hidden" | "planned";
export type BusinessType = "website" | "education" | "marketing" | "general";
export type PlatformWorkspace = { id:string;name:string;slug:string;businessType:BusinessType;createdAt:string;modules:Partial<Record<ModuleKey,ModulePlan>> };
type DB = ReturnType<typeof neon>;
let client:DB|undefined;
let initialized:Promise<void>|undefined;
export function platformStorageConfigured():boolean {
  return Boolean(process.env.AGENCY_PLATFORM_DATABASE_URL?.trim());
}
function database():DB {
  const uri=process.env.AGENCY_PLATFORM_DATABASE_URL?.trim();
  if(!uri) throw new Error("Dedicated platform database is not configured");
  if(!client)client=neon(uri);
  return client;
}
/** Additive schema in a dedicated platform database; never uses GHL token storage. */
async function setup():Promise<void>{
  const db=database();
  await db.query("CREATE TABLE IF NOT EXISTS agency_platform_workspaces (id UUID PRIMARY KEY,name VARCHAR(120) NOT NULL,slug VARCHAR(64) NOT NULL UNIQUE,business_type VARCHAR(60) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.query("CREATE TABLE IF NOT EXISTS agency_platform_module_plans (workspace_id UUID NOT NULL REFERENCES agency_platform_workspaces(id) ON DELETE RESTRICT,module_key VARCHAR(40) NOT NULL,rollout_state VARCHAR(20) NOT NULL CHECK (rollout_state IN ('hidden','planned')),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(workspace_id,module_key))");
  await db.query("CREATE TABLE IF NOT EXISTS agency_platform_audit_events (id BIGSERIAL PRIMARY KEY,workspace_id UUID REFERENCES agency_platform_workspaces(id) ON DELETE RESTRICT,action VARCHAR(80) NOT NULL,detail JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.query("CREATE TABLE IF NOT EXISTS agency_platform_domains (id UUID PRIMARY KEY,workspace_id UUID NOT NULL REFERENCES agency_platform_workspaces(id) ON DELETE RESTRICT,hostname VARCHAR(255) NOT NULL UNIQUE,verified BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.query("CREATE TABLE IF NOT EXISTS agency_platform_memberships (workspace_id UUID NOT NULL REFERENCES agency_platform_workspaces(id) ON DELETE RESTRICT,identity_subject VARCHAR(255) NOT NULL,role VARCHAR(32) NOT NULL CHECK (role IN ('client_owner','client_editor','instructor','viewer')),PRIMARY KEY(workspace_id,identity_subject))");
}
export async function readySql():Promise<DB>{
  const db=database();
  if(!initialized) initialized=setup().catch(e=>{initialized=undefined;throw e;});
  await initialized;return db;
}
const moduleKeys=new Set<string>(MODULES.map(m=>m.key));
export function isModuleKey(v:unknown):v is ModuleKey{return typeof v==="string"&&moduleKeys.has(v);}
export function validSlug(v:unknown):v is string{return typeof v==="string"&&/^[a-z][a-z0-9-]{2,47}$/.test(v)&&!v.includes("--");}
export function validWorkspaceName(v:unknown):v is string{return typeof v==="string"&&v.trim().length>=2&&v.trim().length<=120;}
export function validBusinessType(v:unknown):v is BusinessType{return v==="website"||v==="education"||v==="marketing"||v==="general";}
export function validWorkspaceId(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
type Row={id:string;name:string;slug:string;business_type:BusinessType;created_at:string|Date};
function toRows<T>(result:unknown):T[]{
  if(Array.isArray(result))return result as T[];
  if(result&&typeof result==="object"&&"rows" in result&&Array.isArray(result.rows))return result.rows as T[];
  throw new Error("Invalid database response");
}
function mapRow(row:Row):PlatformWorkspace{return {id:row.id,name:row.name,slug:row.slug,businessType:row.business_type,createdAt:new Date(row.created_at).toISOString(),modules:{}};}
export async function listPlatformWorkspaces():Promise<PlatformWorkspace[]>{
  const db=await readySql();
  const rows=toRows<Row>(await db.query("SELECT id,name,slug,business_type,created_at FROM agency_platform_workspaces ORDER BY created_at DESC LIMIT 100"));
  const plans=toRows<{workspace_id:string;module_key:string;rollout_state:string}>(await db.query("SELECT workspace_id,module_key,rollout_state FROM agency_platform_module_plans WHERE workspace_id IN (SELECT id FROM agency_platform_workspaces)"));
  const map=new Map<string,PlatformWorkspace>();
  for(const row of rows)map.set(row.id,mapRow(row));
  for(const plan of plans){const item=map.get(String(plan.workspace_id));if(item&&isModuleKey(plan.module_key)&&(plan.rollout_state==="hidden"||plan.rollout_state==="planned"))item.modules[plan.module_key]=plan.rollout_state;}
  return [...map.values()];
}
export async function createPlatformWorkspace(input:{name:string;slug:string;businessType:BusinessType}):Promise<PlatformWorkspace>{
  const db=await readySql();
  const id=randomUUID();
  const rows=toRows<Row>(await db.query(
    "WITH workspace AS (INSERT INTO agency_platform_workspaces (id,name,slug,business_type) VALUES ($1::uuid,$2,$3,$4) RETURNING id,name,slug,business_type,created_at), audit AS (INSERT INTO agency_platform_audit_events (workspace_id,action,detail) SELECT id,'workspace.created',jsonb_build_object('slug',slug) FROM workspace RETURNING id) SELECT id,name,slug,business_type,created_at FROM workspace",
    [id,input.name,input.slug,input.businessType]
  ));
  return mapRow(rows[0]);
}
export async function setModulePlan(workspaceId:string,moduleKey:ModuleKey,state:ModulePlan):Promise<boolean>{
  const db=await readySql();
  const rows=toRows<{workspace_id:string}>(await db.query(
    "WITH changed AS (INSERT INTO agency_platform_module_plans (workspace_id,module_key,rollout_state) SELECT id,$2,$3 FROM agency_platform_workspaces WHERE id=$1::uuid ON CONFLICT (workspace_id,module_key) DO UPDATE SET rollout_state=EXCLUDED.rollout_state,updated_at=NOW() RETURNING workspace_id,module_key,rollout_state), audit AS (INSERT INTO agency_platform_audit_events (workspace_id,action,detail) SELECT workspace_id,'module.plan.updated',jsonb_build_object('module',module_key,'state',rollout_state) FROM changed RETURNING id) SELECT workspace_id FROM changed",
    [workspaceId,moduleKey,state]
  ));
  return rows.length>0;
}
