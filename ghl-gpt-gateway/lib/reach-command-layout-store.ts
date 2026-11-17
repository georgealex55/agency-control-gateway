import {readySql,platformStorageConfigured} from "@/lib/platform-store";
import {parseCommandLayout,DEFAULT_COMMAND_LAYOUT,type CommandLayout} from "@/lib/reach-command-contract";
import {validWorkspaceId} from "@/lib/platform-validation";
import {createHash,timingSafeEqual} from "node:crypto";
import {commandLayoutStatement} from "@/lib/reach-command-layout-sql";
type Row={revision:number;layout:unknown};
function rows<T>(x:unknown):T[]{if(Array.isArray(x))return x as T[];if(x&&typeof x==="object"&&"rows" in x&&Array.isArray(x.rows))return x.rows as T[];throw Error("Invalid database response");}
// Explicit staging branch and opt-in. The preview must not inherit write access from a different branch.
export function commandLayoutStage():boolean{
 return process.env.VERCEL_ENV==="preview"&&process.env.VERCEL_GIT_COMMIT_REF==="experiment/reach-23-ui-redesign-staging-20261115";
}
/**
 * The existing AGENCY_PLATFORM_DATABASE_URL is set in global Vercel scopes.
 * A branch name alone cannot prove that this URL is isolated from production.
 * Require a separately approved exact credential fingerprint and opt-in flag
 * before ANY new dashboard handler calls readySql() (which can create tables).
 * Keep the expected fingerprint in a branch-scoped sensitive Vercel variable.
 */
export function commandApprovedStorageConfigured():boolean{
 if(!commandLayoutStage()||process.env.REACH_COMMAND_ISOLATED_STORAGE_ENABLED!=="true"||!platformStorageConfigured())return false;
 const uri=process.env.AGENCY_PLATFORM_DATABASE_URL?.trim()||"";
 const expected=process.env.REACH_COMMAND_APPROVED_DATABASE_SHA256?.trim().toLowerCase()||"";
 if(!/^[0-9a-f]{64}$/.test(expected)||!uri)return false;
 const actual=createHash("sha256").update(uri,"utf8").digest();
 return timingSafeEqual(actual,Buffer.from(expected,"hex"));
}
export function commandLayoutWritesEnabled():boolean{
 return commandApprovedStorageConfigured()&&process.env.REACH_COMMAND_LAYOUT_WRITES_ENABLED==="true";
}
const ddl="CREATE TABLE IF NOT EXISTS agency_reach_command_layouts ("+
 "workspace_id UUID PRIMARY KEY REFERENCES agency_platform_workspaces(id) ON DELETE RESTRICT,"+
 "layout JSONB NOT NULL,revision INT NOT NULL DEFAULT 1 CHECK(revision>0),"+
 "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())";
async function openWorkspace(workspaceId:string){
 if(!validWorkspaceId(workspaceId)||!commandApprovedStorageConfigured())return null;
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
 const parsed=saved?parseCommandLayout(saved.layout):null;
 if(saved&&!parsed)throw Error("Saved dashboard layout is invalid");
 return {found:true,layout:parsed||DEFAULT_COMMAND_LAYOUT,
  revision:saved?Number(saved.revision):0,saveEnabled:true};
}
export async function saveCommandLayout(workspaceId:string,layoutValue:unknown,expectedRevision:unknown){
 const layout=parseCommandLayout(layoutValue);
 if(!layout||!Number.isSafeInteger(expectedRevision)||typeof expectedRevision!=="number"||expectedRevision<0)return {status:"invalid" as const};
 if(!commandLayoutWritesEnabled())return {status:"disabled" as const};
 const db=await openWorkspace(workspaceId);
 if(!db)return {status:"not_found" as const};
 await db.query(ddl);
 // Atomic insert-only on the first save; compare-and-set update on later saves.
 // Rows returning from the statement correspond to exactly one audit receipt.
 const result=rows<{revision:number}>(await db.query(
  commandLayoutStatement(expectedRevision),[workspaceId,JSON.stringify(layout),expectedRevision]
 ));
 if(!result.length)return {status:"conflict" as const};
 return {status:"saved" as const,revision:Number(result[0].revision),layout};
}
