import {NextRequest} from "next/server";
import {gate,reply,workspaceFromQuery} from "@/lib/social-api";
import {providerReadiness} from "@/lib/social-provider-catalog";
import {getMetaInventory} from "@/lib/social-meta-connection-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const denied=gate(req);if(denied)return denied;
 const workspaceId=workspaceFromQuery(req);
 if(!workspaceId)return reply({error:"Valid workspace ID required"},400);
 // The static catalog is configuration, not a source of truth for connected accounts.
 // Query only this authenticated administrator's selected workspace. Never return tokens.
 try{
  const inventory=await getMetaInventory(workspaceId);
  const now=Date.now();
  const connections=providerReadiness().map(provider=>{
   const metaProvider=provider.id==="facebook"?"facebook_pages":provider.id==="instagram"?"instagram_professional":null;
   if(!metaProvider)return provider;
   const linked=inventory.connections.filter(item=>item.provider===metaProvider);
   const active=linked.some(item=>!item.expired);
   const pending=inventory.pending.some(item=>item.provider===metaProvider&&Date.parse(item.expiresAt)>now);
   return {...provider,connectionStatus:active?"read_only":linked.length?"expired":pending?"authorization_pending":"not_connected",
    connectedAccounts:linked.length,oauthEnabled:false,publishingEnabled:false,analyticsEnabled:false};
  });
  return reply({workspaceId,connections,authEnabled:false,publishingEnabled:false,realMetricsAvailable:false});
 }catch{
  // Never replace a failed inventory lookup with an authoritative "not connected" claim.
  return reply({error:"Social provider inventory unavailable"},503);
 }
}
