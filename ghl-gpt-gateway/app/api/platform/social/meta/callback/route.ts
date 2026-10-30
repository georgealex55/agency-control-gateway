import {createHash,timingSafeEqual} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {stageEnabled} from "@/lib/social-contract";
import {metaConfigured,metaSetupStatus} from "@/lib/social-meta-contract";
import {verifyMetaConsent} from "@/lib/social-meta-crypto";
import {consumeMetaFlow,stageMetaCandidates} from "@/lib/social-meta-connection-store";
import {oauthSettings,exchangeMetaCode} from "@/lib/social-meta-oauth-server";
import {exchangeFacebookLongLived,exchangeInstagramLongLived} from "@/lib/social-meta-token-lifecycle";
import {listFacebookPages} from "@/lib/social-meta-pages";
import {readInstagramProfessionalProfile} from "@/lib/social-meta-instagram";
export const runtime="nodejs";export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
function toSocial(req:NextRequest,status:"failed"|"canceled"|"select"){
 const destination=new URL("/",req.nextUrl.origin);destination.searchParams.set("social","connections");destination.searchParams.set("meta",status);
 const response=NextResponse.redirect(destination,{status:303,headers:noStore});
 response.cookies.set("agency_meta_nonce","",{path:"/api/platform/social/meta/callback",httpOnly:true,secure:true,sameSite:"lax",maxAge:0});
 return response;
}
function sameNonce(a:string,b:string){
 const x=Buffer.from(createHash("sha256").update(a).digest()),y=Buffer.from(createHash("sha256").update(b).digest());
 return timingSafeEqual(x,y);
}
/** OAuth callback is bound to the admin-initiated Lax cookie, signed state and one-time Neon flow.
 * The legacy admin session itself is SameSite=Strict and is not sent from Meta's cross-site redirect.
 */
export async function GET(req:NextRequest){
 if(!stageEnabled(process.env)||process.env.SOCIAL_META_CONNECTIONS_ENABLED!=="true"){
  return NextResponse.json({error:"Meta connections are disabled in this staging deployment"},{status:423,headers:noStore});
 }
 const state=req.nextUrl.searchParams.get("state")||"";
 const cookie=req.cookies.get("agency_meta_nonce")?.value||"";
 const secret=process.env.SOCIAL_META_OAUTH_STATE_SECRET||"";
 const parsed=verifyMetaConsent(state,secret,Date.now());
 if(!parsed||!cookie||!sameNonce(cookie,parsed.nonce))return toSocial(req,"failed");
 if(!metaConfigured(process.env,parsed.provider))return toSocial(req,"failed");
 const settings=oauthSettings(process.env,parsed.provider);
 const setup=metaSetupStatus(process.env,parsed.provider,req.nextUrl.origin);
 if(!setup.isCanonicalHost||!setup.branchMatches)return toSocial(req,"failed");
 try{
  if(!await consumeMetaFlow(parsed.workspaceId,parsed.provider,parsed.nonce))return toSocial(req,"failed");
  if(req.nextUrl.searchParams.has("error")||req.nextUrl.searchParams.has("error_reason"))return toSocial(req,"canceled");
  const code=req.nextUrl.searchParams.get("code");
  if(!code)return toSocial(req,"failed");
  const shortLived=await exchangeMetaCode(parsed.provider,code,settings);
  const authorized=parsed.provider==="facebook_pages"?
   await exchangeFacebookLongLived({shortLivedToken:shortLived.token,appId:settings.clientId,appSecret:settings.clientSecret,graphVersion:settings.version}):
   await exchangeInstagramLongLived({shortLivedToken:shortLived.token,appSecret:settings.clientSecret});
  const candidates=parsed.provider==="facebook_pages"?
   (await listFacebookPages({token:authorized.token,version:settings.version})).map(p=>({id:p.id,name:p.name,tasks:p.tasks})):
   [await readInstagramProfessionalProfile({token:authorized.token,version:settings.version})].map(p=>({id:p.id,name:"@"+p.username,accountType:p.accountType}));
  await stageMetaCandidates(parsed.workspaceId,parsed.provider,authorized.token,authorized.expiresAt,candidates,process.env.SOCIAL_META_TOKEN_KEY||"");
  return toSocial(req,"select");
 }catch{
  return toSocial(req,"failed");
 }
}
