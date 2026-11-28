import {createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";
import {GOOGLE_CALLBACK,googleGrant,groupFor,type GoogleGroup} from "./reach-google-contract";
import {normalizeDomain} from "./reach-infrastructure";
export const digest=(s:string)=>createHash("sha256").update(s).digest("base64url");
export const random=()=>randomBytes(32).toString("base64url");
function key(env:NodeJS.ProcessEnv){const k=env.REACH_GOOGLE_TOKEN_KEY||"";if(!/^[A-Za-z0-9_-]{43}$/.test(k)||Buffer.from(k,"base64url").length!==32)throw Error("Google encryption unavailable");return Buffer.from(k,"base64url");}
export function sealGoogle(value:string,context:string,env:NodeJS.ProcessEnv=process.env){
 if(!value||value.length>8192)throw Error("Invalid credential");
 const iv=randomBytes(12),c=createCipheriv("aes-256-gcm",key(env),iv);c.setAAD(Buffer.from("reach-google:v1:"+context));const body=Buffer.concat([c.update(value,"utf8"),c.final()]);return ["v1",iv.toString("base64url"),body.toString("base64url"),c.getAuthTag().toString("base64url")].join(".");
}
export function openGoogle(value:string,context:string,env:NodeJS.ProcessEnv=process.env){
 const p=value.split(".");if(p.length!==4||p[0]!=="v1"||p.slice(1).some(s=>!/^[A-Za-z0-9_-]+$/.test(s)))throw Error("Invalid envelope");
 const iv=Buffer.from(p[1],"base64url"),body=Buffer.from(p[2],"base64url"),tag=Buffer.from(p[3],"base64url");if(iv.length!==12||tag.length!==16||!body.length||body.length>32768)throw Error("Invalid envelope");
 const d=createDecipheriv("aes-256-gcm",key(env),iv);d.setAAD(Buffer.from("reach-google:v1:"+context));d.setAuthTag(tag);return Buffer.concat([d.update(body),d.final()]).toString("utf8");
}
type Obj=Record<string,any>;
const obj=(v:unknown):Obj=>v&&typeof v==="object"&&!Array.isArray(v)?v as Obj:{};
const array=(v:unknown):Obj[]=>Array.isArray(v)?v.slice(0,100).map(obj):[];
const name=(v:unknown)=>typeof v==="string"?v.slice(0,200):"Unnamed";
export async function googleJson(url:string,init:RequestInit={},fetcher:typeof fetch=fetch){
 const u=new URL(url);if(u.protocol!=="https:"||u.port||u.username||u.password||!["oauth2.googleapis.com","openidconnect.googleapis.com","analyticsadmin.googleapis.com","analyticsdata.googleapis.com","www.googleapis.com","youtube.googleapis.com","people.googleapis.com","tagmanager.googleapis.com"].includes(u.hostname))throw Error("Unapproved Google endpoint");
 const r=await fetcher(u.href,{...init,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(9000)});if(!r.ok||!r.body)throw Error("Google request unavailable");
 const reader=r.body.getReader();let size=0,text="";const dec=new TextDecoder();try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000)throw Error("Google response too large");text+=dec.decode(value,{stream:true});}return obj(JSON.parse(text+dec.decode()));}finally{await reader.cancel().catch(()=>{});}
}
const tokenOk=(x:unknown):x is string=>typeof x==="string"&&x.length>0&&x.length<=8192&&!/[\r\n\0]/.test(x);
async function token(params:Record<string,string>,env:NodeJS.ProcessEnv,fetcher:typeof fetch){
 return googleJson("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({...params,client_id:env.REACH_GOOGLE_CLIENT_ID!,client_secret:env.REACH_GOOGLE_CLIENT_SECRET!})},fetcher);
}
export async function googleIdentity(access:string,fetcher:typeof fetch=fetch){
 const v=await googleJson("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:"Bearer "+access}},fetcher);
 if(typeof v.sub!=="string"||!/^\d{1,64}$/.test(v.sub)||v.email_verified!==true||typeof v.email!=="string"||v.email.length>254)throw Error("Google identity unavailable");
 return {subject:v.sub as string,email:v.email as string};
}
export async function exchangeGoogle(code:string,verifier:string,group:GoogleGroup,env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch){
 if(!code||code.length>4096||!/^[A-Za-z0-9_-]{43}$/.test(verifier))throw Error("Invalid authorization");
 const v=await token({code,code_verifier:verifier,redirect_uri:GOOGLE_CALLBACK,grant_type:"authorization_code"},env,fetcher);
 const scopes=googleGrant(v.scope,group);
 if(!scopes||!tokenOk(v.access_token)||!tokenOk(v.refresh_token)||String(v.token_type).toLowerCase()!=="bearer")throw Error("Required read-only grant or offline access missing");
 return {...await googleIdentity(v.access_token,fetcher),access:v.access_token,refresh:v.refresh_token,scopes};
}
export async function refreshGoogle(refresh:string,group:GoogleGroup,subject:string,env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch){
 const v=await token({refresh_token:refresh,grant_type:"refresh_token"},env,fetcher);
 if(!tokenOk(v.access_token)||String(v.token_type).toLowerCase()!=="bearer"||!googleGrant(v.scope,group)||(await googleIdentity(v.access_token,fetcher)).subject!==subject)throw Error("Grant no longer valid");
 return v.access_token;
}
export type Candidate={id:string;name:string};
export async function discoverGoogle(group:GoogleGroup,access:string,subject:string,host:string|null,fetcher:typeof fetch=fetch):Promise<Candidate[]>{
 const get=(url:string)=>googleJson(url,{headers:{Authorization:"Bearer "+access}},fetcher);
 if(groupFor(group)?.domain&&(!host||normalizeDomain(host)!==host))throw Error("Invalid domain");
 if(group==="ga4"){
 const data=await get("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=100");
 const props=array(data.accountSummaries).flatMap(a=>array(a.propertySummaries)).filter(p=>typeof p.property==="string"&&/^properties\/\d{1,20}$/.test(p.property)).slice(0,15);
 // The selected website must match the property web stream's configured default URI.
 const matches:Candidate[]=[];
 for(let i=0;i<props.length;i+=5)await Promise.all(props.slice(i,i+5).map(async p=>{try{const streams=await get("https://analyticsadmin.googleapis.com/v1beta/"+p.property+"/dataStreams?pageSize=100");if(array(streams.dataStreams).some(s=>{try{const u=new URL(s.webStreamData?.defaultUri);return u.protocol==="https:"&&u.hostname===host&&!u.port&&!u.username&&!u.password;}catch{return false;}}))matches.push({id:p.property,name:name(p.displayName)});}catch{}}));
 return matches;
 }
 if(group==="search_console"){const data=await get("https://www.googleapis.com/webmasters/v3/sites");return array(data.siteEntry).filter(s=>s.siteUrl==="https://"+host+"/"&&["siteOwner","siteFullUser","siteRestrictedUser"].includes(s.permissionLevel)).map(s=>({id:s.siteUrl,name:s.siteUrl}));}
 if(group==="youtube"){const d=await get("https://youtube.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50");return array(d.items).filter(x=>typeof x.id==="string"&&/^UC[A-Za-z0-9_-]{22}$/.test(x.id)).map(x=>({id:x.id,name:name(x.snippet?.title)}));}
 if(group==="calendar"){const d=await get("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100&minAccessRole=reader");return array(d.items).filter(x=>typeof x.id==="string"&&x.id.length<=254).map(x=>({id:x.id,name:name(x.summary)}));}
 if(group==="tag_manager"){const d=await get("https://tagmanager.googleapis.com/tagmanager/v2/accounts");return array(d.account).filter(x=>typeof x.path==="string"&&/^accounts\/\d{1,20}$/.test(x.path)).map(x=>({id:x.path,name:name(x.name)}));}
 if(group==="contacts")return [{id:subject,name:"Authorized Google Contacts account"}];
 return [];
}
