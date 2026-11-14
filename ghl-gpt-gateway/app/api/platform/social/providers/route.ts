import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {providerReadiness} from "@/lib/social-provider-catalog";
import {getMetaInventory} from "@/lib/social-meta-connection-store";
export const runtime="nodejs";export const dynamic="force-dynamic";

// Only the selected workspace's read-only inventory can establish a connection.
// No request-supplied provider credentials, token material or arbitrary account IDs.
type ConnectionState="disconnected"|"missing_config"|"authorization_pending"|"read_only"|"expired"|"revoked"|"error";
function metaConfigured(provider:"facebook"|"instagram"){
 const prefix=provider==="facebook"?"SOCIAL_META_FACEBOOK":"SOCIAL_META_INSTAGRAM";
 return process.env.SOCIAL_META_CONNECTIONS_ENABLED==="true" &&
  Boolean(process.env.SOCIAL_META_REDIRECT_URI && process.env.SOCIAL_META_GRAPH_VERSION &&
   process.env.SOCIAL_META_OAUTH_STATE_SECRET && process.env.SOCIAL_META_TOKEN_KEY &&
   process.env[prefix+"_CLIENT_ID"] && process.env[prefix+"_CLIENT_SECRET"]);
}
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);
 if(!workspaceId)return reply({error:"Valid workspace ID required"},400);
 try{
  const inventory=await getMetaInventory(workspaceId);
  const now=Date.now();
  const connections=providerReadiness().map(provider=>{
   const metaProvider=provider.id==="facebook"?"facebook_pages":provider.id==="instagram"?"instagram_professional":null;
   if(!metaProvider)return {...provider,connectionStatus:"missing_config" as ConnectionState,connectedAccounts:0,
    permissionMode:"disconnected" as const};
   const linked=inventory.connections.filter(item=>item.provider===metaProvider);
   const active=linked.filter(item=>!item.expired);
   const pending=inventory.pending.some(item=>item.provider===metaProvider&&Date.parse(item.expiresAt)>now);
   // Saved account state must remain visible even when this preview lacks OAuth configuration.
   const connectionStatus:ConnectionState=active.length?"read_only":linked.length?"expired":
    pending?"authorization_pending":metaConfigured(provider.id as "facebook"|"instagram")?"disconnected":"missing_config";
   return {...provider,connectionStatus,connectedAccounts:active.length,
    permissionMode:active.length?"read_only":"disconnected",oauthEnabled:false,
    publishingEnabled:false,analyticsEnabled:false};
  });
  return reply({workspaceId,connections,authEnabled:false,publishingEnabled:false,realMetricsAvailable:false});
 }catch{
  // Do not disclose tenant records or treat a failed lookup as an empty inventory.
  return reply({error:"Social provider inventory unavailable",status:"error"},503);
 }
}
