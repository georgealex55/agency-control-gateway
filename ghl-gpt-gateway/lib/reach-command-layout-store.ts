import {readySql,platformStorageConfigured} from "@/lib/platform-store";
import {parseCommandLayout,DEFAULT_COMMAND_LAYOUT,type CommandLayout} from "@/lib/reach-command-contract";
import {validWorkspaceId} from "@/lib/platform-validation";
import {createHash,timingSafeEqual} from "node:crypto";
import {readCommandLayoutRow,persistCommandLayoutRow,type LayoutSqlRunner} from "@/lib/reach-command-layout-sql";
function rows<T>(x:unknown):T[]{if(Array.isArray(x))return x as T[];if(x&&typeof x==="object"&&"rows" in x&&Array.isArray(x.rows))return x.rows as T[];throw Error("Invalid database response");}
// Explicit staging branch and opt-in. The preview must not inherit write access from a different branch.
export function commandIsReach23Branch():boolean{
 return process.env.VERCEL_GIT_COMMIT_REF==="experiment/reach-23-ui-redesign-staging-20261115";
}
export function commandLayoutStage():boolean{
 return process.env.VERCEL_ENV==="preview"&&commandIsReach23Branch();
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
async function openWorkspace(workspaceId:string){
 if(!validWorkspaceId(workspaceId)||!commandApprovedStorageConfigured())return null;
 const db=await readySql();
 const found=rows<{id:string}>(await db.query("SELECT id FROM agency_platform_workspaces WHERE id=$1::uuid LIMIT 1",[workspaceId]));
 return found.length===1?db:null;
}
export async function getCommandLayout(workspaceId:string):Promise<{found:boolean;layout:CommandLayout;revision:number;saveEnabled:boolean}>{
 const db=await openWorkspace(workspaceId);
 if(!db)return {found:false,layout:DEFAULT_COMMAND_LAYOUT,revision:0,saveEnabled:false};
 // Read existing saved preferences even if this approved preview is currently read-only.
 // No layout DDL is executed unless writes are explicitly opted in.
 const writesEnabled=commandLayoutWritesEnabled();
 const run:LayoutSqlRunner=(statement,params)=>params?db.query(statement,params):db.query(statement);
 const saved=await readCommandLayoutRow(run,workspaceId,writesEnabled);
 const parsed=saved?parseCommandLayout(saved.layout):null;
 if(saved&&!parsed)throw Error("Saved dashboard layout is invalid");
 return {found:true,layout:parsed||DEFAULT_COMMAND_LAYOUT,
  revision:saved?saved.revision:0,saveEnabled:writesEnabled};
}
export async function saveCommandLayout(workspaceId:string,layoutValue:unknown,expectedRevision:unknown){
 const layout=parseCommandLayout(layoutValue);
 if(!layout||!Number.isSafeInteger(expectedRevision)||typeof expectedRevision!=="number"||expectedRevision<0)return {status:"invalid" as const};
 if(!commandLayoutWritesEnabled())return {status:"disabled" as const};
 const db=await openWorkspace(workspaceId);
 if(!db)return {status:"not_found" as const};
 // The SQL adapter uses exact workspace-scoped, compare-and-set statements.
 const run:LayoutSqlRunner=(statement,params)=>params?db.query(statement,params):db.query(statement);
 const revision=await persistCommandLayoutRow(run,workspaceId,JSON.stringify(layout),expectedRevision);
 if(revision===null)return {status:"conflict" as const};
 return {status:"saved" as const,revision,layout};
}
