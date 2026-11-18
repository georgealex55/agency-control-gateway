/**
 * Two atomic compare-and-set statements. Splitting revision=0 insert from
 * revision>0 update avoids the old INSERT...SELECT WHERE revision=0 bug:
 * the old query could never update an existing saved layout.
 *
 * This module is pure to permit synthetic contract tests without a database.
 */
const audit="audit AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) "+
 "SELECT workspace_id,'reach.dashboard.layout_saved',jsonb_build_object('revision',revision) FROM saved RETURNING id) "+
 "SELECT revision FROM saved";
export const COMMAND_LAYOUT_INSERT_SQL=
 "WITH saved AS (INSERT INTO agency_reach_command_layouts(workspace_id,layout,revision) "+
 "SELECT id,$2::jsonb,1 FROM agency_platform_workspaces WHERE id=$1::uuid "+
 "ON CONFLICT(workspace_id) DO NOTHING RETURNING workspace_id,revision),"+audit;
export const COMMAND_LAYOUT_UPDATE_SQL=
 "WITH saved AS (UPDATE agency_reach_command_layouts "+
 "SET layout=$2::jsonb,revision=revision+1,updated_at=now() "+
 "WHERE workspace_id=$1::uuid AND revision=$3::int "+
 "RETURNING workspace_id,revision),"+audit;
export function commandLayoutStatement(expectedRevision:number):string{
 return expectedRevision===0?COMMAND_LAYOUT_INSERT_SQL:COMMAND_LAYOUT_UPDATE_SQL;
}

/**
 * Minimal SQL adapter enables runtime integration-style replay with a synthetic
 * workspace DB, without provisioning a real database or bypassing staging gates.
 * The read-only path NEVER performs DDL, even when a layout table is absent.
 */
export type LayoutSqlRunner=(statement:string,params?:unknown[])=>Promise<unknown>;
export const COMMAND_LAYOUT_TABLE_DDL="CREATE TABLE IF NOT EXISTS agency_reach_command_layouts ("+
 "workspace_id UUID PRIMARY KEY REFERENCES agency_platform_workspaces(id) ON DELETE RESTRICT,"+
 "layout JSONB NOT NULL,revision INT NOT NULL DEFAULT 1 CHECK(revision>0),"+
 "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())";
export const COMMAND_LAYOUT_TABLE_EXISTS_SQL="SELECT to_regclass('agency_reach_command_layouts')::text AS table_name";
export const COMMAND_LAYOUT_GET_SQL="SELECT layout,revision FROM agency_reach_command_layouts WHERE workspace_id=$1::uuid";
function queryRows<T>(v:unknown):T[]{
 if(Array.isArray(v))return v as T[];
 if(v&&typeof v==="object"&&"rows" in v&&Array.isArray(v.rows))return v.rows as T[];
 throw Error("Invalid SQL response");
}
export async function readCommandLayoutRow(run:LayoutSqlRunner,workspaceId:string,writable:boolean):
 Promise<{layout:unknown;revision:number}|null>{
 if(writable){
  await run(COMMAND_LAYOUT_TABLE_DDL);
 }else{
  const table=queryRows<{table_name:string|null}>(await run(COMMAND_LAYOUT_TABLE_EXISTS_SQL))[0];
  if(!table?.table_name)return null;
 }
 const row=queryRows<{layout:unknown;revision:unknown}>(await run(COMMAND_LAYOUT_GET_SQL,[workspaceId]))[0];
 if(!row)return null;
 if(typeof row.revision!=="number"||!Number.isSafeInteger(row.revision)||row.revision<1)
  throw Error("Invalid saved layout revision");
 return {layout:row.layout,revision:row.revision};
}
export async function persistCommandLayoutRow(run:LayoutSqlRunner,workspaceId:string,serializedLayout:string,expectedRevision:number):
 Promise<number|null>{
 await run(COMMAND_LAYOUT_TABLE_DDL);
 const records=queryRows<{revision:unknown}>(await run(commandLayoutStatement(expectedRevision),
  [workspaceId,serializedLayout,expectedRevision]));
 if(!records.length)return null;
 const revision=records[0]?.revision;
 if(typeof revision!=="number"||!Number.isSafeInteger(revision)||revision<1)
  throw Error("Invalid saved layout revision");
 return revision;
}
