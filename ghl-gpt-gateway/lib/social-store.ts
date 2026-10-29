import {randomUUID} from "crypto";
import {readySql} from "@/lib/platform-store";
import {type SocialInput,type SocialState} from "@/lib/social-contract";
type R=Record<string,unknown>;
function rows<T>(v:unknown):T[]{if(Array.isArray(v))return v as T[];if(v&&typeof v==="object"&&"rows" in v&&Array.isArray(v.rows))return v.rows as T[];throw Error("Database query returned an invalid result");}
export type SocialPost={id:string;workspaceId:string;content:string;state:SocialState;channels:string[];scheduledAt:string|null;createdAt:string;updatedAt:string};
function toPost(o:R):SocialPost{return {id:String(o.id),workspaceId:String(o.workspace_id),content:String(o.content),state:o.state as SocialState,channels:Array.isArray(o.channels)?o.channels as string[]:[],scheduledAt:o.scheduled_at?new Date(String(o.scheduled_at)).toISOString():null,createdAt:new Date(String(o.created_at)).toISOString(),updatedAt:new Date(String(o.updated_at)).toISOString()};}
const cols="id,workspace_id,content,state,channels,scheduled_at,created_at,updated_at";
export async function listSocialPosts(workspaceId:string):Promise<{posts:SocialPost[];summary:Record<SocialState,number>}>{
 const db=await readySql();
 const list=rows<R>(await db.query("SELECT "+cols+" FROM agency_social_posts WHERE workspace_id=$1::uuid ORDER BY created_at DESC LIMIT 100",[workspaceId])).map(toPost);
 const counts={draft:0,planned:0,approved:0};
 for(const item of list)counts[item.state]++;
 return {posts:list,summary:counts};
}
export async function createSocialPost(workspaceId:string,input:SocialInput):Promise<SocialPost|null>{
 const db=await readySql();const id=randomUUID();
 const result=rows<R>(await db.query(
  "WITH created AS (INSERT INTO agency_social_posts(id,workspace_id,content,state,channels,scheduled_at) SELECT $1::uuid,id,$3,$4,$5::jsonb,$6::timestamptz FROM agency_platform_workspaces WHERE id=$2::uuid RETURNING "+cols+"), audit AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) SELECT workspace_id,'social.draft.created',jsonb_build_object('post_id',id,'state',state) FROM created RETURNING id) SELECT * FROM created",
  [id,workspaceId,input.content,input.state,JSON.stringify(input.channels),input.scheduledAt]
 ));
 return result[0]?toPost(result[0]):null;
}
export async function updateSocialPost(workspaceId:string,postId:string,input:SocialInput):Promise<SocialPost|null>{
 const db=await readySql();
 const result=rows<R>(await db.query(
  "WITH updated AS (UPDATE agency_social_posts SET content=$3,state=$4,channels=$5::jsonb,scheduled_at=$6::timestamptz,updated_at=NOW() WHERE id=$2::uuid AND workspace_id=$1::uuid RETURNING "+cols+"),audit AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) SELECT workspace_id,'social.draft.updated',jsonb_build_object('post_id',id,'state',state) FROM updated RETURNING id) SELECT * FROM updated",
  [workspaceId,postId,input.content,input.state,JSON.stringify(input.channels),input.scheduledAt]
 ));
 return result[0]?toPost(result[0]):null;
}
export async function deleteSocialPost(workspaceId:string,postId:string):Promise<boolean>{
 const db=await readySql();
 const result=rows<{id:string}>(await db.query(
  "WITH removed AS (DELETE FROM agency_social_posts WHERE workspace_id=$1::uuid AND id=$2::uuid RETURNING id,workspace_id),audit AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) SELECT workspace_id,'social.draft.deleted',jsonb_build_object('post_id',id) FROM removed RETURNING id) SELECT id FROM removed",
  [workspaceId,postId]
 ));
 return result.length===1;
}
