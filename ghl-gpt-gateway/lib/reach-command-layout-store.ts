import {readySql,platformStorageConfigured} from "@/lib/platform-store";
import {parseCommandLayout,DEFAULT_COMMAND_LAYOUT,type CommandLayout} from "@/lib/reach-command-contract";
import {validWorkspaceId} from "@/lib/platform-validation";
type Row={revision:number;layout:unknown};
function rows<T>(x:unknown):T[]{if(Array.isArray(x))return x as T[];if(x&&typeof x==="object"&&"rows" in x&&Array.isArray(x.rows))return x.rows as T[];throw Error("Invalid database response");}
// Explicit staging branch and opt-in. The preview must not inherit write access from a different branch.
export function commandLayoutStage():boolean{
 return process.env.VERCEL_ENV==="preview"&&process.env.VERCEL_GIT_COMMIT_REF==="experiment/reach-23-ui-redesign-staging-20261115";
}
export function commandLayoutWritesEnabled():boolean{
 return commandLayoutStage()&&process.env.REACH_COMMAND_LAYOUT_WRITES_ENABLED==="true"&&platformStorageConfigured();
}
const ddl="CREATE TABLE IF NOT EXISTS agency_reach_command_layouts ("+
 "workspace_id UUID PRIMARY KEY REFERENCES agency_platform_workspaces(id) ON DELETE RESTRICT,"+
 "layout JSONB NOT NULL,revision INT NOT NULL DEFAULT 1 CHECK(revision>0),"+
 "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())";
async function openWorkspace(workspaceId:string){
 if(!validWorkspaceId(workspaceId)||!platformStorageConfigured())return null;
 const db=await readySql();
 const found=rows<{id:string}>(await db.query("SELECT id FROM agency_platform_workspaces WHERE id=$1::uuid LIMIT 1",[workspaceId]));
 return found.length===1?db:null;
}
export async function getCommandLayout(workspaceId:string):Promise<{found:boolean;layout:CommandLayout;revision:number;saveEnabled:boolean}>{
 const db=await openWorkspace(workspaceId);
 if(!db)return {found:false,layout:DEFAULT_COMMAND_LAYOUT,revision:0,saveEnabled:false};
 if(!commandLayoutWritesEnabled())return {found:true,layout:DEFAULT_COMMAND_LAYOUT,revision:0,saveEnabled:false};
 await db.query(ddl);
 const saved=rows<Row>(await db.query("SELECT layout,revision FROM agency_reach_command_layouts WHERE workspace_id=$1::uuid",[workspaceId]))[0];
 return {found:true,layout:saved?parseCommandLayout(saved.layout)||DEFAULT_COMMAND_LAYOUT:DEFAULT_COMMAND_LAYOUT,
  revision:saved?Number(saved.revision):0,saveEnabled:true};
}
export async function saveCommandLayout(workspaceId:string,layoutValue:unknown,expectedRevision:unknown){
 const layout=parseCommandLayout(layoutValue);
 if(!layout||!Number.isSafeInteger(expectedRevision)||typeof expectedRevision!=="number"||expectedRevision<0)return {status:"invalid" as const};
 if(!commandLayoutWritesEnabled())return {status:"disabled" as const};
 const db=await openWorkspace(workspaceId);
 if(!db)return {status:"not_found" as const};
 await db.query(ddl);
 const result=rows<{revision:number}>(await db.query(
  "WITH saved AS ("+
  "INSERT INTO agency_reach_command_layouts(workspace_id,layout,revision) "+
  "SELECT id,$2::jsonb,1 FROM agency_platform_workspaces WHERE id=$1::uuid AND $3::int=0 "+
  "ON CONFLICT(workspace_id) DO UPDATE SET layout=EXCLUDED.layout,revision=agency_reach_command_layouts.revision+1,updated_at=now() "+
  "WHERE agency_reach_command_layouts.revision=$3::int RETURNING workspace_id,revision),"+
  "audit AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) "+
  "SELECT workspace_id,'reach.dashboard.layout_saved',jsonb_build_object('revision',revision) FROM saved RETURNING id) "+
  "SELECT revision FROM saved",[workspaceId,JSON.stringify(layout),expectedRevision]
 ));
 if(!result.length)return {status:"conflict" as const};
 return {status:"saved" as const,revision:Number(result[0].revision),layout};
}
