import {NextRequest,NextResponse} from "next/server";
import {GOOGLE_ORIGIN,CALLBACK_PATH,googleConfigured} from "@/lib/reach-google-contract";
import {approvedGoogleWorkspace,consumeGoogleFlow,stageGoogle} from "@/lib/reach-google-store";
import {exchangeGoogle} from "@/lib/reach-google-oauth";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=30;
function finish(status:string){
 const u=new URL("/connections",GOOGLE_ORIGIN);u.searchParams.set("google",status);
 const r=NextResponse.redirect(u,{status:303,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
 r.cookies.set("reach_google_browser","",{path:CALLBACK_PATH,httpOnly:true,secure:true,sameSite:"lax",maxAge:0});return r;
}
export async function GET(req:NextRequest){
 const w=process.env.REACH_SOCIAL_OWNER_WORKSPACE_ID,state=req.nextUrl.searchParams.get("state")||"",browser=req.cookies.get("reach_google_browser")?.value||"";
 if(req.nextUrl.origin!==GOOGLE_ORIGIN||!googleConfigured()||!approvedGoogleWorkspace(w)||! /^[A-Za-z0-9_-]{43}$/.test(state)||! /^[A-Za-z0-9_-]{43}$/.test(browser))return finish("failed");
 try{
 // Strict owner cookie is not expected across Google's redirect. One-use state and
 // independently generated browser cookie bind this to the authenticated start.
 const flow=await consumeGoogleFlow(w,state,browser);
 if(req.nextUrl.searchParams.has("error"))return finish(req.nextUrl.searchParams.get("error")==="access_denied"?"canceled":"failed");
 const code=req.nextUrl.searchParams.get("code");if(!code)return finish("failed");
 const grant=await exchangeGoogle(code,flow.verifier,flow.group);
 await stageGoogle(w,flow.group,flow.domainId,grant);return finish("select");
 }catch{return finish("failed");}
}
