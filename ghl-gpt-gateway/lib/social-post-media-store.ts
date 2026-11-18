import {readySql} from "@/lib/platform-store";
type Raw=Record<string,unknown>;
function rows<T>(value:unknown):T[]{if(Array.isArray(value))return value as T[];if(value&&typeof value==="object"&&"rows" in value&&Array.isArray(value.rows))return value.rows as T[];throw Error("Invalid database result");}
export type AttachedMedia={id:string;name:string;mime:string;size:number;attachedAt:string};
export async function listPostMedia(workspaceId:string,postId:string):Promise<AttachedMedia[]>{
 const db=await readySql();
 const result=rows<Raw>(await db.query(
  "SELECT m.id,m.original_name,m.mime_type,m.byte_size,x.attached_at "+
  "FROM agency_social_post_media x JOIN agency_social_media m ON m.id=x.media_id AND m.workspace_id=x.workspace_id "+
  "WHERE x.workspace_id=$1::uuid AND x.post_id=$2::uuid ORDER BY x.attached_at,x.media_id LIMIT 30",
  [workspaceId,postId]
 ));
 return result.map(x=>({id:String(x.id),name:String(x.original_name),mime:String(x.mime_type),size:Number(x.byte_size),attachedAt:new Date(String(x.attached_at)).toISOString()}));
}
export async function attachPostMedia(workspaceId:string,postId:string,mediaId:string):Promise<boolean>{
 const db=await readySql();
 const added=rows<{media_id:string}>(await db.query(
  "WITH attached AS (INSERT INTO agency_social_post_media(workspace_id,post_id,media_id) "+
  "SELECT p.workspace_id,p.id,m.id FROM agency_social_posts p JOIN agency_social_media m "+
  "ON m.workspace_id=p.workspace_id WHERE p.workspace_id=$1::uuid AND p.id=$2::uuid AND m.id=$3::uuid "+
  "AND (SELECT count(*) FROM agency_social_post_media x WHERE x.post_id=p.id)<10 "+
  "ON CONFLICT(post_id,media_id) DO NOTHING RETURNING workspace_id,post_id,media_id), "+
  "bumped AS (UPDATE agency_social_posts p SET updated_at=now() FROM attached a WHERE p.id=a.post_id AND p.workspace_id=a.workspace_id RETURNING p.id), "+
  "audited AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) "+
  "SELECT workspace_id,'social.media.attached',jsonb_build_object('post_id',post_id,'media_id',media_id) "+
  "FROM attached RETURNING id) SELECT media_id FROM attached",
  [workspaceId,postId,mediaId]
 ));
 return added.length===1;
}
export async function detachPostMedia(workspaceId:string,postId:string,mediaId:string):Promise<boolean>{
 const db=await readySql();
 const removed=rows<{media_id:string}>(await db.query(
  "WITH detached AS (DELETE FROM agency_social_post_media WHERE workspace_id=$1::uuid "+
  "AND post_id=$2::uuid AND media_id=$3::uuid RETURNING workspace_id,post_id,media_id), "+
  "bumped AS (UPDATE agency_social_posts p SET updated_at=now() FROM detached a WHERE p.id=a.post_id AND p.workspace_id=a.workspace_id RETURNING p.id), "+
  "audited AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) "+
  "SELECT workspace_id,'social.media.detached',jsonb_build_object('post_id',post_id,'media_id',media_id) "+
  "FROM detached RETURNING id) SELECT media_id FROM detached",
  [workspaceId,postId,mediaId]
 ));
 return removed.length===1;
}
