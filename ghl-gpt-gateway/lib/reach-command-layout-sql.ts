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
