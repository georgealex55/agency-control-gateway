import { neon } from "@neondatabase/serverless";

const EXPECTED_PROJECT = "lively-morning-77987546";
const EXPECTED_BRANCH = "br-shiny-river-av8dqh2j";
const EXPECTED_HOST = "ep-wispy-shape-avlihp8l-pooler.c-11.us-east-1.aws.neon.tech";
const EXPECTED_DATABASE = "neondb";
const EXPECTED_ROLE = "reach_personal_runtime";

export const PERSONAL_WORKSPACE = "personal-staging" as const;
export const RECORD_KINDS = ["lead","contact","appointment","business_profile","note"] as const;
export type RecordKind = typeof RECORD_KINDS[number];

export function personalWorkspaceId(): string | null {
  const value = process.env.REACH_PERSONAL_WORKSPACE_ID || "";
  return /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value) ? value : null;
}

export function fieldclockDb() {
  const connection = process.env.REACH_PERSONAL_DATABASE_URL || "";
  if (process.env.REACH_PERSONAL_NEON_PROJECT_ID !== EXPECTED_PROJECT ||
      process.env.REACH_NEON_STAGING_BRANCH_ID !== EXPECTED_BRANCH ||
      !personalWorkspaceId()) return null;
  try {
    const url = new URL(connection);
    if (url.protocol !== "postgresql:" || url.hostname !== EXPECTED_HOST ||
        url.pathname !== "/" + EXPECTED_DATABASE || url.username !== EXPECTED_ROLE ||
        !url.password || url.port || url.hash) return null;
    return neon(connection);
  } catch { return null; }
}

export async function checkPersonalDb(): Promise<{ connected: boolean; reason: string }> {
  const sql = fieldclockDb();
  if (!sql) return {connected:false, reason:"staging_not_configured"};
  try {
    const [row] = await sql`SELECT current_database()::text AS db_name, current_user::text AS role_name,
      to_regclass('reach_personal_stage.records') IS NOT NULL AS records_ready,
      to_regclass('reach_personal_stage.connection_registry') IS NOT NULL AS registry_ready`;
    if (row?.db_name !== EXPECTED_DATABASE || row?.role_name !== EXPECTED_ROLE ||
        row?.records_ready !== true || row?.registry_ready !== true) {
      return {connected:false,reason:"schema_verification_failed"};
    }
    return {connected:true,reason:"verified_read_only_query"};
  } catch { return {connected:false,reason:"database_unreachable"}; }
}

export type PersonalRecord = {
  id:string;kind:RecordKind;title:string;notes:string;created_at:string;updated_at:string;
};

export async function getPersonalRecords(): Promise<PersonalRecord[]> {
  const sql=fieldclockDb(), workspace=personalWorkspaceId();
  if (!sql || !workspace) throw new Error("Personal staging database is not configured");
  const results=await sql.transaction([
    sql`SELECT set_config('reach.workspace_id', ${workspace}, true)`,
    sql`SELECT id::text, kind, title, notes, created_at, updated_at
      FROM reach_personal_stage.records
      WHERE workspace_id=${workspace}::uuid ORDER BY created_at DESC LIMIT 100`
  ]);
  return results[1] as PersonalRecord[];
}

export async function savePersonalRecord(input:{
  kind:RecordKind;title:string;notes:string;requestId:string;
}): Promise<PersonalRecord | null> {
  const sql=fieldclockDb(), workspace=personalWorkspaceId();
  if (!sql || !workspace) throw new Error("Personal staging database is not configured");
  const results=await sql.transaction([
    sql`SELECT set_config('reach.workspace_id', ${workspace}, true)`,
    sql`INSERT INTO reach_personal_stage.records(workspace_id,kind,title,notes,request_id)
      VALUES (${workspace}::uuid,${input.kind},${input.title},${input.notes},${input.requestId}::uuid)
      ON CONFLICT (workspace_id,request_id) DO NOTHING
      RETURNING id::text,kind,title,notes,created_at,updated_at`
  ]);
  return (results[1]?.[0] as PersonalRecord | undefined) || null;
}
