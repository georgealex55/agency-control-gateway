import {NextRequest,NextResponse} from "next/server";
import {GOOGLE_ORIGIN,CALLBACK_PATH,googleConfigured} from "@/lib/reach-google-contract";
import {approvedGoogleWorkspace,consumeGoogleFlow,stageGoogle} from "@/lib/reach-google-store";
import {resolvedGoogleEnv} from "@/lib/reach-google-developer-store";
import {exchangeGoogle,digest} from "@/lib/reach-google-oauth";
import {canonicalGoogleRequest,validGoogleNonce,providerDiagnostic,safeDiagnostic,type GoogleDiagnostic} from "@/lib/reach-google-diagnostics";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
function finish(code:GoogleDiagnostic,cookieName?:string){
 // Log only fixed enum values, never provider responses, URLs, authorization codes, state or tokens.
 console.info("reach_google_callback",code);
 const u=new URL("/connections",GOOGLE_ORIGIN);u.searchParams.set("google",code==="selection_ready"?"select":code==="consent_denied"?"canceled":"failed");u.searchParams.set("google_reason",code);u.hash="google-oauth";
 const r=NextResponse.redirect(u,{status:303,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
 if(cookieName)r.cookies.set(cookieName,"",{path:CALLBACK_PATH,httpOnly:true,secure:true,sameSite:"lax",maxAge:0});
 return r;
}
export async function GET(req:NextRequest){
 if(!canonicalGoogleRequest(req.nextUrl.origin,req.headers.get("host"),req.headers.get("x-forwarded-host"),req.headers.get("x-forwarded-proto"),process.env.VERCEL_ENV))return finish("callback_origin");
 const w=process.env.REACH_SOCIAL_OWNER_WORKSPACE_ID;
 if(!approvedGoogleWorkspace(w))return finish("configuration_unavailable");
 const state=req.nextUrl.searchParams.get("state");
 if(!state)return finish("state_missing");
 if(!validGoogleNonce(state)||req.nextUrl.searchParams.getAll("state").length!==1)return finish("state_invalid");
 const name="reach_google_browser_"+digest(state);
 // Legacy cookie remains supported for attempts initiated before the rollout.
 const specific=req.cookies.get(name)?.value,legacy=req.cookies.get("reach_google_browser")?.value;
 const browser=specific??legacy,cookieName=specific!==undefined?name:legacy!==undefined?"reach_google_browser":undefined;
 if(!validGoogleNonce(browser))return finish("cookie_missing",cookieName);
 let stage:GoogleDiagnostic="configuration_unavailable";
 try{
 const env=await resolvedGoogleEnv(w);if(!googleConfigured(env))return finish("configuration_unavailable",cookieName);
 // The strict owner session cookie is intentionally not needed for cross-site GET.
 // Browser nonce + one-use stored state + PKCE remain mandatory.
 stage="flow_storage";
 const flow=await consumeGoogleFlow(w,state,browser,env);
 if(req.nextUrl.searchParams.has("error"))return finish(providerDiagnostic(req.nextUrl.searchParams.get("error")),cookieName);
 const code=req.nextUrl.searchParams.get("code");if(!code||req.nextUrl.searchParams.getAll("code").length!==1)return finish("code_missing",cookieName);
 stage="token_unavailable";
 const grant=await exchangeGoogle(code,flow.verifier,flow.group,env);
 stage="pending_storage";
 await stageGoogle(w,flow.group,flow.domainId,grant,env);return finish("selection_ready",cookieName);
 }catch(e){return finish(safeDiagnostic(e,stage),cookieName);}
}
