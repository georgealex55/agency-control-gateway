import {randomUUID} from "node:crypto";
import {readySql} from "@/lib/platform-store";
import type {MediaMime} from "@/lib/social-media-contract";
type Row=Record<string,unknown>;
function records<T>(x:unknown):T[]{if(Array.isArray(x))return x as T[];if(x&&typeof x==="object"&&"rows" in x&&Array.isArray(x.rows))return x.rows as T[];throw Error("Invalid database response");}
export type SocialMedia={id:string;workspaceId:string;name:string;mime:string;size:number;createdAt:string};
type PrivateMedia=SocialMedia&{blobPath:string};
function convert(x:Row):PrivateMedia{return {id:String(x.id),workspaceId:String(x.workspace_id),name:String(x.original_name),mime:String(x.mime_type),size:Number(x.byte_size),blobPath:String(x.blob_path),createdAt:new Date(String(x.created_at)).toISOString()};}
export async function listMedia(workspaceId:string):Promise<SocialMedia[]>{
 const sql=await readySql();
 const rows=records<Row>(await sql.query("SELECT id,workspace_id,original_name,mime_type,byte_size,blob_path,created_at FROM agency_social_media WHERE workspace_id=$1::uuid ORDER BY created_at DESC LIMIT 100",[workspaceId]));
 return rows.map(x=>{const {blobPath,...safe}=convert(x);void blobPath;return safe;});
}
export async function mediaRecord(workspaceId:string,id:string):Promise<PrivateMedia|null>{
 const sql=await readySql();
 const recordsFound=records<Row>(await sql.query("SELECT id,workspace_id,original_name,mime_type,byte_size,blob_path,created_at FROM agency_social_media WHERE id=$1::uuid AND workspace_id=$2::uuid",[id,workspaceId]));
 return recordsFound[0]?convert(recordsFound[0]):null;
}
export async function mediaWorkspaceExists(workspaceId:string):Promise<boolean>{
 const sql=await readySql();
 return records<{id:string}>(await sql.query("SELECT id FROM agency_platform_workspaces WHERE id=$1::uuid",[workspaceId])).length===1;
}
export async function createMedia(input:{id:string;workspaceId:string;name:string;mime:MediaMime;size:number;blobPath:string}):Promise<SocialMedia|null>{
 const sql=await readySql();
 const found=records<Row>(await sql.query("WITH saved AS (INSERT INTO agency_social_media(id,workspace_id,original_name,mime_type,byte_size,blob_path) SELECT $1::uuid,id,$3,$4,$5,$6 FROM agency_platform_workspaces WHERE id=$2::uuid RETURNING id,workspace_id,original_name,mime_type,byte_size,blob_path,created_at), audit AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) SELECT workspace_id,'social.media.added',jsonb_build_object('media_id',id,'mime',mime_type) FROM saved RETURNING id) SELECT * FROM saved",[input.id,input.workspaceId,input.name,input.mime,input.size,input.blobPath]));
 if(!found[0])return null;
 const {blobPath,...safe}=convert(found[0]);void blobPath;return safe;
}
export function newMediaId(){return randomUUID();}
