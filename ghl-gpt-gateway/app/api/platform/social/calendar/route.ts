import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {validCalendarRange} from "@/lib/social-calendar-contract";
import {listSocialCalendar} from "@/lib/social-calendar-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);
 const start=req.nextUrl.searchParams.get("start"),end=req.nextUrl.searchParams.get("end");
 if(!workspaceId||!start||!end||!validCalendarRange(start,end))return reply({error:"Valid workspace and 1–45 day UTC calendar bounds required"},400);
 try{return reply({...await listSocialCalendar(workspaceId,{start,end}),externalPublishing:false});}
 catch{return reply({error:"Calendar unavailable"},503);}
}
