import {NextRequest,NextResponse} from "next/server";
import {adminAuthenticated,portalConfigured} from "@/lib/portal-auth";
import {SOCIAL_PROVIDER_CATALOG} from "@/lib/social-provider-catalog";
import {META_PROVIDERS,metaSetupStatus} from "@/lib/social-meta-contract";
import {connectionRuntimeEnabled,connectionRuntimeStatus} from "@/lib/reach-connection-runtime";
import {listPlatformWorkspaces} from "@/lib/platform-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
/** Returns no secrets, raw tokens or unverifiable 'connected' indicators. */
export async function GET(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Owner sign-in required"},401);
 const enabled=connectionRuntimeEnabled(),environment=connectionRuntimeStatus();
 const meta=META_PROVIDERS.map(provider=>{
  const status=metaSetupStatus(process.env,provider,req.nextUrl.origin);
  return {provider,appConfigured:status.appConfigured,missingSettings:status.missingSettings,
   permissions:status.permissions,callbackUrl:status.callbackUrl,
   launchEnabled:enabled&&status.launchEnabled,readOnly:true,publishingEnabled:false};
 });
 const providers=SOCIAL_PROVIDER_CATALOG.map(p=>({
  id:p.id,name:p.name,accounts:p.accounts,scopes:[...p.scopes],appSetup:p.appSetup,
  mode:p.id==="facebook"||p.id==="instagram"?"read_only" as const:"setup_required" as const,
  launchEnabled:p.id==="facebook"?meta[0].launchEnabled:p.id==="instagram"?meta[1].launchEnabled:false,
  publishingEnabled:false,connectionStatus:"not_verified" as const
 }));
 if(!enabled)return reply({
  authenticated:true,environment,storageApproved:false,workspaces:[],providers,meta,
  publishingEnabled:false,externalMessagingEnabled:false,
  requiredSetup:["AGENCY_PORTAL_PASSWORD_SHA256","AGENCY_PORTAL_SESSION_SECRET",
   "REACH_CONNECTIONS_PRODUCTION_ENABLED","REACH_CONNECTIONS_APPROVED_DATABASE_SHA256",
   "AGENCY_PLATFORM_DATABASE_URL","SOCIAL_META_CONNECTIONS_ENABLED"]
 });
 try{
  const workspaces=await listPlatformWorkspaces();
  return reply({authenticated:true,environment,storageApproved:true,
   workspaces:workspaces.map(w=>({id:w.id,name:w.name,slug:w.slug})),
   providers,meta,publishingEnabled:false,externalMessagingEnabled:false,requiredSetup:[]});
 }catch{return reply({error:"Approved workspace database unavailable"},503);}
}
