import {normalizeDomain} from "./reach-infrastructure";
import {accessToken,gaRequest,parseGaReport,REPORTS} from "./reach-web-analytics";
import {pageSpeed} from "./reach-web-seo";
export const VERIFY_IDS=["ga4","search_console","pagespeed","shopify"] as const;
export type VerifyId=typeof VERIFY_IDS[number];
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function validShop(v:unknown):v is string{return typeof v==="string"&&/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(v);}
export function mapProperty(host:string,raw:string|undefined){try{const m=obj(JSON.parse(raw||"{}"));return Object.hasOwn(m,host)&&typeof m[host]==="string"?m[host] as string:null;}catch{return null;}}
async function json(fetcher:typeof fetch,url:string,init:RequestInit={}){
 const r=await fetcher(url,{...init,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error("Provider denied or unavailable");
 if(!r.body)throw Error("Empty provider response");
 const reader=r.body.getReader();let count=0,text="";const decoder=new TextDecoder();
 try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>1000000)throw Error("Provider response too large");text+=decoder.decode(value,{stream:true});}return obj(JSON.parse(text+decoder.decode()));}finally{await reader.cancel().catch(()=>{});}
}
export function configured(provider:VerifyId,host:string|null,env:NodeJS.ProcessEnv=process.env){
 if(provider==="shopify")return validShop(env.REACH_SHOPIFY_SHOP)&&!!env.REACH_SHOPIFY_CLIENT_ID&&!!env.REACH_SHOPIFY_CLIENT_SECRET;
 if(provider==="pagespeed")return !!env.REACH_PAGESPEED_API_KEY;
 if(!host||normalizeDomain(host)!==host)return false;
 if(provider==="ga4")return /^\d{1,20}$/.test(mapProperty(host,env.REACH_WEB_ANALYTICS_PROPERTIES)||"")&&!!env.REACH_WEB_ANALYTICS_SERVICE_ACCOUNT;
 return mapProperty(host,env.REACH_WEB_SEO_PROPERTIES)==="https://"+host+"/"&&!!env.REACH_WEB_SEO_SERVICE_ACCOUNT;
}
export async function verifyIntegration(provider:VerifyId,host:string|null,env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch){
 const result=(status:string,detail:string,account:string|null=null,scopes:string[]=[])=>({provider,status,detail,account,scopes,checkedAt:new Date().toISOString(),readOnly:true});
 if(provider!=="shopify"&&(!host||normalizeDomain(host)!==host))return result("setup_required","Select a registered hostname.");
 if(provider!=="pagespeed"&&!configured(provider,host,env))return result("setup_required","Protected deployment configuration is incomplete.");
 try{
 if(provider==="ga4"&&host){
 const id=mapProperty(host,env.REACH_WEB_ANALYTICS_PROPERTIES)!;
 const token=await accessToken(env,fetcher),spec=REPORTS[0];
 const raw=await json(fetcher,"https://analyticsdata.googleapis.com/v1beta/properties/"+id+":runReport",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(gaRequest(host,7,spec))});
 const report=parseGaReport(raw,spec);
 return result("verified",report.rows.length?"Authorized hostname-filtered report returned.":"Property access verified; no matching rows in this period.",host,["analytics.readonly"]);
 }
 if(provider==="search_console"&&host){
 const token=await accessToken(env,fetcher,"search_console");
 const property="https://"+host+"/";
 const data=await json(fetcher,"https://www.googleapis.com/webmasters/v3/sites/"+encodeURIComponent(property),{headers:{Authorization:"Bearer "+token}});
 if(data.siteUrl!==property||!["siteOwner","siteFullUser","siteRestrictedUser"].includes(String(data.permissionLevel)))throw Error("Property access not verified");
 return result("verified","Exact HTTPS property access verified.",host,["webmasters.readonly"]);
 }
 if(provider==="pagespeed"&&host){
 const audit=await pageSpeed(host,"mobile",env,fetcher);
 return audit.status==="available"?result("verified","Public mobile audit returned; no ongoing account connection required.",host):result("unavailable",audit.status==="redirected"?"Homepage redirects to another hostname; register the final hostname separately.":"Public audit unavailable; check API quota and site reachability.",host);
 }
 if(provider==="shopify"){
 const shop=env.REACH_SHOPIFY_SHOP!;
 if(!validShop(shop))throw Error("Invalid store");
 const credentials=await json(fetcher,"https://"+shop+"/admin/oauth/access_token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"client_credentials",client_id:env.REACH_SHOPIFY_CLIENT_ID!,client_secret:env.REACH_SHOPIFY_CLIENT_SECRET!})});
 if(typeof credentials.access_token!=="string"||!credentials.access_token||credentials.access_token.length>8192)throw Error("Missing access token");
 const data=await json(fetcher,"https://"+shop+"/admin/api/2026-10/graphql.json",{method:"POST",headers:{"X-Shopify-Access-Token":credentials.access_token,"Content-Type":"application/json"},body:JSON.stringify({query:"query ReachConnection { shop { myshopifyDomain } currentAppInstallation { accessScopes { handle } } }"})});
 if(data.errors)throw Error("Shopify GraphQL error");
 const root=obj(data.data),identity=obj(root.shop),installed=obj(root.currentAppInstallation);
 if(identity.myshopifyDomain!==shop||!Array.isArray(installed.accessScopes))throw Error("Store identity not verified");
 const scopes=installed.accessScopes.map(x=>obj(x).handle).filter((v):v is string=>typeof v==="string"&&/^[a-z_]{1,100}$/.test(v)).slice(0,100);
 if(scopes.some(s=>s.startsWith("write_")))return result("attention","Installed app has write access. Use a dedicated read-only app.",shop,scopes);
 if(!["read_products","read_inventory"].every(s=>scopes.includes(s)))return result("attention","Store identity verified; required read scopes missing.",shop,scopes);
 return result("verified","Installed app and read-only store permissions verified. Commerce reporting adapter is not yet implemented.",shop,scopes);
 }
 return result("unavailable","Provider unavailable.");
 }catch{return result("unavailable","Provider verification failed. Check credentials, approved scopes and API availability.");}
}
