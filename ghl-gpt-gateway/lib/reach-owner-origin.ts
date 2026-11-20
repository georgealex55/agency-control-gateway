/**
 * CSRF origin validation for the single-owner REACH portal.
 * NextRequest.nextUrl.origin can be an internal deployment hostname behind
 * Vercel's production aliases. Validate the browser Origin against the actual
 * routed Host AND an explicit allowlist, never against arbitrary user input.
 */
export type OwnerOriginContext={
 originHeader:string|null;
 requestUrlOrigin:string;
 hostHeader:string|null;
 forwardedHostHeader:string|null;
 forwardedProtoHeader:string|null;
 vercelEnvironment?:string;
 vercelDeploymentUrl?:string;
 configuredCanonicalOrigin?:string;
};
const productionHosts=new Set([
 "agency-control-gateway.vercel.app",
 "agency-control-gateway-georgealex1925-2750s-projects.vercel.app",
 "agency-control-gateway-git-main-georgealex1925-2750s-projects.vercel.app"
]);
function parsedOrigin(v:string):URL|null{
 try{
  const url=new URL(v);
  if(!["https:","http:"].includes(url.protocol)||url.username||url.password||url.pathname!=="/"||url.search||url.hash)return null;
  return url;
 }catch{return null;}
}
function parseTrustedHost(value:string|null,protocol:"https"|"http"):string|null{
 if(!value||!/^([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(?::[0-9]{1,5})?$/.test(value))return null;
 try{
  const url=new URL(protocol+"://"+value);
  if(url.username||url.password||url.pathname!=="/")return null;
  return url.host.toLowerCase();
 }catch{return null;}
}
export function ownerSameOrigin(context:OwnerOriginContext):boolean{
 if(!context.originHeader)return false;
 const browser=parsedOrigin(context.originHeader);
 if(!browser)return false;
 // Direct local / standard Next.js requests retain the original matching origin.
 if(browser.origin===context.requestUrlOrigin&&context.vercelEnvironment!=="production")return true;
 // Production requires a routed, explicitly trusted hostname even when nextUrl
 // happens to match the Origin. An attacker-controlled Host cannot authorize it.
 if(context.vercelEnvironment!=="production"||context.forwardedProtoHeader!=="https")return false;
 const forwarded=parseTrustedHost(context.forwardedHostHeader,"https");
 const host=parseTrustedHost(context.hostHeader,"https");
 if(forwarded&&host&&forwarded!==host)return false;
 const routedHost=forwarded||host;
 if(!routedHost||browser.protocol!=="https:"||browser.host.toLowerCase()!==routedHost)return false;
 const allowed=new Set(productionHosts);
 const deployment=parseTrustedHost(context.vercelDeploymentUrl||null,"https");
 if(deployment)allowed.add(deployment);
 if(context.configuredCanonicalOrigin){
  const canonical=parsedOrigin(context.configuredCanonicalOrigin);
  if(canonical?.protocol==="https:")allowed.add(canonical.host.toLowerCase());
 }
 return allowed.has(routedHost);
}
