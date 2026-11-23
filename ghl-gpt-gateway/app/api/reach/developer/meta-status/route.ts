import {NextRequest,NextResponse} from "next/server";
import {adminAuthenticated} from "@/lib/portal-auth";
import {connectionRuntimeEnabled} from "@/lib/reach-connection-runtime";
import {META_PROVIDERS,metaSetupStatus,duplicateMetaAppId} from "@/lib/social-meta-contract";
import {resolvedMetaEnv} from "@/lib/reach-meta-app-vault";
export const runtime="nodejs";export const dynamic="force-dynamic";
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
/** Platform developer diagnostics only. Customers use connection-hub, which deliberately omits app settings. */
export async function GET(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Developer owner sign-in required"},401);
 const enabled=connectionRuntimeEnabled();
 const environments=await Promise.all(META_PROVIDERS.map(p=>resolvedMetaEnv(p)));
 const sameAppId=duplicateMetaAppId(environments[0].SOCIAL_META_FACEBOOK_CLIENT_ID,environments[1].SOCIAL_META_INSTAGRAM_CLIENT_ID);
 const meta=META_PROVIDERS.map((provider,index)=>{
  const state=metaSetupStatus(environments[index],provider,req.nextUrl.origin);
  return {provider,appConfigured:state.appConfigured,missingSettings:state.missingSettings,
   permissions:state.permissions,callbackUrl:state.callbackUrl,
   launchEnabled:enabled&&state.launchEnabled&&!(provider==="instagram_professional"&&sameAppId),
   duplicateAppId:provider==="instagram_professional"&&sameAppId,
   readOnly:true as const,publishingEnabled:false as const};
 });
 return reply({authenticated:true,storageApproved:enabled,meta,developerOnly:true,publishingEnabled:false});
}
