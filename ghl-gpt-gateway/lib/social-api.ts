import {NextRequest,NextResponse} from "next/server";
import {adminAuthenticated,sameOrigin} from "@/lib/portal-auth";
import {stageEnabled,validId} from "@/lib/social-contract";
export const noCache={"Cache-Control":"no-store"};
export function reply(value:unknown,status=200){return NextResponse.json(value,{status,headers:noCache});}
export function gate(req:NextRequest,write=false):NextResponse|null{
 if(write&&!sameOrigin(req))return reply({error:"Invalid request origin"},403);
 if(!adminAuthenticated(req))return reply({error:"Agency administrator sign-in required"},401);
 if(!stageEnabled(process.env))return reply({error:"Social Intelligence is isolated to the staging branch"},403);
 return null;
}
export function workspaceFromQuery(req:NextRequest):string|null{
 const id=req.nextUrl.searchParams.get("workspaceId");
 return validId(id)?id:null;
}
