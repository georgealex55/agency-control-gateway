import {readySql} from "@/lib/platform-store";
import {CALENDAR_MAX_ITEMS,type CalendarRange} from "@/lib/social-calendar-contract";
import type {SocialPost} from "@/lib/social-store";
type Row=Record<string,unknown>;
function rows<T>(v:unknown):T[]{if(Array.isArray(v))return v as T[];if(v&&typeof v==="object"&&"rows" in v&&Array.isArray(v.rows))return v.rows as T[];throw Error("Invalid calendar result");}
function map(row:Row):SocialPost{
 return {id:String(row.id),workspaceId:String(row.workspace_id),content:String(row.content),state:row.state as SocialPost["state"],channels:Array.isArray(row.channels)?row.channels as string[]:[],scheduledAt:row.scheduled_at?new Date(String(row.scheduled_at)).toISOString():null,createdAt:new Date(String(row.created_at)).toISOString(),updatedAt:new Date(String(row.updated_at)).toISOString()};
}
export async function listSocialCalendar(workspaceId:string,range:CalendarRange){
 const db=await readySql();
 const data=rows<Row>(await db.query(
  "SELECT id,workspace_id,content,state,channels,scheduled_at,created_at,updated_at "+
  "FROM agency_social_posts WHERE workspace_id=$1::uuid AND scheduled_at >= $2::timestamptz "+
  "AND scheduled_at < $3::timestamptz ORDER BY scheduled_at ASC,id LIMIT $4",
  [workspaceId,range.start,range.end,CALENDAR_MAX_ITEMS+1]
 ));
 return {posts:data.slice(0,CALENDAR_MAX_ITEMS).map(map),truncated:data.length>CALENDAR_MAX_ITEMS,limit:CALENDAR_MAX_ITEMS,range};
}
