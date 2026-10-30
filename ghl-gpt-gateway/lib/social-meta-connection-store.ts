import {createHash,randomUUID} from "node:crypto";
import {readySql} from "@/lib/platform-store";
import {encryptMetaToken,decryptMetaToken} from "@/lib/social-meta-crypto";
import type {MetaProvider} from "@/lib/social-meta-contract";
type Row=Record<string,unknown>;
function rows<T>(v:unknown):T[]{if(Array.isArray(v))return v as T[];if(v&&typeof v==="object"&&"rows" in v&&Array.isArray(v.rows))return v.rows as T[];throw Error("Database query result invalid");}
export type MetaCandidate={id:string;name:string;tasks?:string[];accountType?:string};
export type MetaConnection={id:string;provider:MetaProvider;accountId:string;name:string;connectedAt:string;expiresAt:string|null;lastVerifiedAt:string|null;expired:boolean;};
export type MetaPending={id:string;provider:MetaProvider;candidates:MetaCandidate[];expiresAt:string};
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function createMetaFlow(workspaceId:string,provider:MetaProvider,nonce:string,expires:number):Promise<boolean>{
 const db=await readySql();
 const inserted=rows<{id:string}>(await db.query(
  "INSERT INTO agency_social_meta_oauth_flows(id,workspace_id,provider,nonce_hash,expires_at) "+
  "SELECT $1::uuid,w.id,$3,$4,to_timestamp($5::double precision/1000) FROM agency_platform_workspaces w "+
  "WHERE w.id=$2::uuid AND (SELECT count(*) FROM agency_social_meta_oauth_flows f WHERE f.workspace_id=w.id AND f.created_at>now()-interval '10 minutes')<5 RETURNING id",
  [randomUUID(),workspaceId,provider,digest(nonce),expires]
 ));
 return inserted.length===1;
}
export async function consumeMetaFlow(workspaceId:string,provider:MetaProvider,nonce:string):Promise<boolean>{
 const db=await readySql();
 const done=rows<{id:string}>(await db.query(
  "UPDATE agency_social_meta_oauth_flows SET consumed_at=now() WHERE workspace_id=$1::uuid AND provider=$2 "+
  "AND nonce_hash=$3 AND consumed_at IS NULL AND expires_at>now() RETURNING id",[workspaceId,provider,digest(nonce)]
 ));
 return done.length===1;
}
export async function stageMetaCandidates(workspaceId:string,provider:MetaProvider,token:string,tokenExpiresAt:string|null,candidates:MetaCandidate[],key:string):Promise<void>{
 if(!candidates.length||candidates.length>25||candidates.some(c=>!/^[0-9]{2,40}$/.test(c.id)||c.name.length>150))throw Error("No valid Meta account candidates");
 const pendingId=randomUUID(),encrypted=encryptMetaToken(token,key,workspaceId,provider,pendingId);
 const db=await readySql();
 await db.query("INSERT INTO agency_social_meta_pending(id,workspace_id,provider,encrypted_token,candidates,token_expires_at,expires_at) "+
  "VALUES($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6::timestamptz,now()+interval '10 minutes')",
  [pendingId,workspaceId,provider,encrypted,JSON.stringify(candidates),tokenExpiresAt]);
 await db.query("INSERT INTO agency_platform_audit_events(workspace_id,action,detail) VALUES($1::uuid,'social.meta.candidates_ready',jsonb_build_object('provider',$2,'accounts',$3))",
  [workspaceId,provider,candidates.length]);
}
export async function getMetaInventory(workspaceId:string):Promise<{connections:MetaConnection[];pending:MetaPending[]}>{
 const db=await readySql();
 const [linked,waiting]=await Promise.all([
 db.query("SELECT id,provider,provider_account_id,provider_display_name,connected_at,expires_at,last_verified_at "+
  "FROM agency_social_meta_connections WHERE workspace_id=$1::uuid ORDER BY connected_at DESC LIMIT 100",[workspaceId]),
 db.query("SELECT id,provider,candidates,expires_at FROM agency_social_meta_pending WHERE workspace_id=$1::uuid AND expires_at>now() ORDER BY created_at DESC LIMIT 5",[workspaceId])
 ]);
 return {connections:rows<Row>(linked).map(v=>({id:String(v.id),provider:v.provider as MetaProvider,accountId:String(v.provider_account_id),name:String(v.provider_display_name),connectedAt:new Date(String(v.connected_at)).toISOString(),expiresAt:v.expires_at?new Date(String(v.expires_at)).toISOString():null,lastVerifiedAt:v.last_verified_at?new Date(String(v.last_verified_at)).toISOString():null,expired:v.expires_at?new Date(String(v.expires_at)).getTime()<=Date.now():false})),
 pending:rows<Row>(waiting).map(v=>({id:String(v.id),provider:v.provider as MetaProvider,candidates:(Array.isArray(v.candidates)?v.candidates:[]) as MetaCandidate[],expiresAt:new Date(String(v.expires_at)).toISOString()}))};
}
export async function selectMetaCandidate(workspaceId:string,pendingId:string,accountId:string,key:string):Promise<MetaConnection|null>{
 const db=await readySql();
 const staged=rows<Row>(await db.query(
  "SELECT id,workspace_id,provider,candidates,encrypted_token,token_expires_at FROM agency_social_meta_pending "+
  "WHERE id=$1::uuid AND workspace_id=$2::uuid AND expires_at>now()",[pendingId,workspaceId]
 ))[0];
 if(!staged)return null;
 const provider=staged.provider as MetaProvider;
 const candidates=Array.isArray(staged.candidates)?staged.candidates as MetaCandidate[]:[];
 const selected=candidates.find(c=>c.id===accountId);
 if(!selected)return null;
 const token=decryptMetaToken(String(staged.encrypted_token),key,workspaceId,provider,pendingId);
 const encrypted=encryptMetaToken(token,key,workspaceId,provider,accountId);
 // Atomically consume pending consent exactly once; no second account can be silently attached.
 const result=rows<Row>(await db.query(
  "WITH consumed AS (DELETE FROM agency_social_meta_pending WHERE id=$1::uuid AND workspace_id=$2::uuid AND expires_at>now() RETURNING id), "+
  "linked AS (INSERT INTO agency_social_meta_connections(id,workspace_id,provider,provider_account_id,provider_display_name,encrypted_access_token,granted_scopes,expires_at,last_verified_at) "+
  "SELECT $3::uuid,$2::uuid,$4,$5,$6,$7,ARRAY[]::text[],$8::timestamptz,now() FROM consumed "+
  "ON CONFLICT(workspace_id,provider,provider_account_id) DO UPDATE SET "+
  "provider_display_name=EXCLUDED.provider_display_name,encrypted_access_token=EXCLUDED.encrypted_access_token,expires_at=EXCLUDED.expires_at,last_verified_at=now(),connected_at=now() "+
  "RETURNING id,provider,provider_account_id,provider_display_name,connected_at,expires_at), "+
  "audited AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) "+
  "SELECT $2::uuid,'social.meta.connected',jsonb_build_object('connection_id',id,'provider',provider) FROM linked RETURNING id) "+
  "SELECT * FROM linked",
  [pendingId,workspaceId,randomUUID(),provider,accountId,selected.name,encrypted,staged.token_expires_at]
 ));
 if(!result[0])return null;
 const p=result[0];return {id:String(p.id),provider,accountId,name:selected.name,connectedAt:new Date(String(p.connected_at)).toISOString(),expiresAt:p.expires_at?new Date(String(p.expires_at)).toISOString():null,lastVerifiedAt:new Date().toISOString(),expired:false};
}
export async function disconnectMeta(workspaceId:string,connectionId:string):Promise<boolean>{
 const db=await readySql();
 const deleted=rows<{id:string}>(await db.query(
  "WITH gone AS (DELETE FROM agency_social_meta_connections WHERE workspace_id=$1::uuid AND id=$2::uuid RETURNING id,provider), "+
  "audited AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) SELECT $1::uuid,'social.meta.disconnected',jsonb_build_object('connection_id',id,'provider',provider) FROM gone RETURNING id) "+
  "SELECT id FROM gone",[workspaceId,connectionId]
 ));
 return deleted.length===1;
}

export async function metaConnectionCredential(workspaceId:string,connectionId:string,key:string):Promise<{
 provider:MetaProvider;accountId:string;token:string
}|null>{
 const db=await readySql();
 const matched=rows<Row>(await db.query(
  "SELECT provider,provider_account_id,encrypted_access_token,expires_at FROM agency_social_meta_connections "+
  "WHERE workspace_id=$1::uuid AND id=$2::uuid",[workspaceId,connectionId]
 ))[0];
 if(!matched)return null;
 if(matched.expires_at&&new Date(String(matched.expires_at)).getTime()<=Date.now())throw Error("Provider authorization expired; reconnect needed");
 const provider=matched.provider as MetaProvider,accountId=String(matched.provider_account_id);
 const token=decryptMetaToken(String(matched.encrypted_access_token),key,workspaceId,provider,accountId);
 return {provider,accountId,token};
}
export async function markMetaVerified(workspaceId:string,connectionId:string):Promise<boolean>{
 const db=await readySql();
 const done=rows<{id:string}>(await db.query(
  "WITH checked AS (UPDATE agency_social_meta_connections SET last_verified_at=now() WHERE workspace_id=$1::uuid AND id=$2::uuid RETURNING id,provider), "+
  "audited AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) SELECT $1::uuid,'social.meta.verified',jsonb_build_object('connection_id',id,'provider',provider) FROM checked RETURNING id) "+
  "SELECT id FROM checked",[workspaceId,connectionId]
 ));
 return done.length===1;
}
