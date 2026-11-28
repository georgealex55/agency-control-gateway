import {normalizeDomain} from "./reach-infrastructure";
import {accessToken} from "./reach-web-analytics";
type Obj=Record<string,unknown>;
const obj=(x:unknown):Obj=>x&&typeof x==="object"&&!Array.isArray(x)?x as Obj:{};
const num=(x:unknown):number|null=>typeof x==="number"&&Number.isFinite(x)&&x>=0?x:null;
const str=(x:unknown,max=200)=>typeof x==="string"?x.slice(0,max):null;
const categories=["performance","seo","accessibility","best-practices"] as const;
const auditIds=["document-title","meta-description","http-status-code","crawlable-anchors","is-crawlable","robots-txt","canonical","hreflang","image-alt","link-text","viewport","largest-contentful-paint","cumulative-layout-shift","total-blocking-time","first-contentful-paint","speed-index","https"] as const;
async function json(fetcher:typeof fetch,url:string,init:RequestInit={},timeout=10000){
 const r=await fetcher(url,{...init,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw Error("Provider unavailable");
 if(!r.body)throw Error("Empty provider response");
 const reader=r.body.getReader();let bytes=0;const decoder=new TextDecoder();let result="";
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4000000)throw Error("Report too large");result+=decoder.decode(value,{stream:true});}return obj(JSON.parse(result+decoder.decode()));}finally{await reader.cancel().catch(()=>{});}
}
export function parsePageSpeed(raw:unknown,host:string){
 const r=obj(raw),lh=obj(r.lighthouseResult),final=str(lh.finalDisplayedUrl??lh.finalUrl,2048);
 if(!final)throw Error("Audit URL unavailable");
 const url=new URL(final);
 // A redirect to a different host is reported, never attributed to this domain.
 if(url.protocol!=="https:"||url.hostname!==host||url.port||url.username||url.password)return {status:"redirected",scores:[],audits:[],field:[],finalHost:url.hostname,checkedAt:null};
 if(lh.runtimeError)throw Error("Lighthouse runtime error");
 const scores=categories.map(id=>{const s=num(obj(obj(lh.categories)[id]).score);return {id,score:s!==null&&s<=1?Math.round(s*100):null};});
 const audits=auditIds.flatMap(id=>{const a=obj(obj(lh.audits)[id]);if(!Object.keys(a).length)return [];const s=num(a.score);return [{id,title:str(a.title)||id,score:s!==null&&s<=1?s:null,mode:str(a.scoreDisplayMode),display:str(a.displayValue),numeric:num(a.numericValue),unit:str(a.numericUnit)}];});
 // Field data is distinct from simulated lab tests, and not substituted with origin data.
 const loading=obj(r.loadingExperience),fieldId=str(loading.id,2048);
 let matches=false;try{matches=!!fieldId&&new URL(fieldId).origin===url.origin&&new URL(fieldId).pathname===url.pathname&&loading.origin_fallback!==true;}catch{}
 const field=matches?["LARGEST_CONTENTFUL_PAINT_MS","INTERACTION_TO_NEXT_PAINT","CUMULATIVE_LAYOUT_SHIFT_SCORE"].flatMap(id=>{const m=obj(obj(loading.metrics)[id]);const percentile=num(m.percentile);return percentile===null?[]:[{id,percentile,category:str(m.category)}];}):[];
 return {status:scores.some(x=>x.score!==null)?"available":"unavailable",scores,audits,field,finalHost:host,checkedAt:str(lh.fetchTime)};
}
export async function pageSpeed(host:string,strategy:"mobile"|"desktop",env:NodeJS.ProcessEnv,fetcher:typeof fetch){
 if(normalizeDomain(host)!==host||!["mobile","desktop"].includes(strategy))throw Error("Invalid audit");
 const q=new URLSearchParams({url:"https://"+host+"/",strategy,locale:"en",fields:"loadingExperience(id,origin_fallback,metrics),lighthouseResult(finalUrl,finalDisplayedUrl,fetchTime,runtimeError,categories(id,score),audits(id,title,score,scoreDisplayMode,displayValue,numericValue,numericUnit)" + ")"});
 for(const c of categories)q.append("category",c);
 if(env.REACH_PAGESPEED_API_KEY)q.set("key",env.REACH_PAGESPEED_API_KEY);
 try{return parsePageSpeed(await json(fetcher,"https://www.googleapis.com/pagespeedonline/v5/runPagespeed?"+q.toString(),{},40000),host);}
 catch{return {status:"unavailable",scores:[],audits:[],field:[],finalHost:null,checkedAt:null};}
}
export const searchDimensions=["overview","date","query","page","country","device"] as const;
type Dimension=typeof searchDimensions[number];
export function searchRequest(dimension:Dimension,days:7|28|90,now=Date.now()){
 const end=Math.floor(now/86400000)*86400000-3*86400000;
 const date=(n:number)=>new Date(n).toISOString().slice(0,10);
 return {startDate:date(end-(days-1)*86400000),endDate:date(end),dimensions:dimension==="overview"?[]:[dimension],type:"web",dataState:"final",rowLimit:dimension==="date"?days:dimension==="overview"?1:25};
}
export function parseSearch(raw:unknown,dimension:Dimension,host:string){
 const r=obj(raw);
 const rows=(Array.isArray(r.rows)?r.rows:[]).slice(0,90).flatMap(v=>{const a=obj(v),label=dimension==="overview"?"Total":Array.isArray(a.keys)?str(a.keys[0],500):null;if(!label)return [];
 if(dimension==="page"){try{const u=new URL(label);if(u.origin!=="https://"+host)return [];}catch{return [];}}
 const ctr=num(a.ctr);return [{label,clicks:num(a.clicks),impressions:num(a.impressions),ctr:ctr!==null&&ctr<=1?ctr:null,position:num(a.position)}];});
 return {dimension,status:rows.length?"available":"no_rows",rows};
}
export async function searchConsole(host:string,days:7|28|90,env:NodeJS.ProcessEnv,fetcher:typeof fetch){
 // Exact HTTPS URL-prefix property only. No broad domain or other website property.
 let configured=false;try{const m=obj(JSON.parse(env.REACH_WEB_SEO_PROPERTIES||"{}"));configured=Object.hasOwn(m,host)&&m[host]==="https://"+host+"/";}catch{}
 const range=searchRequest("overview",days);
 if(!configured||!env.REACH_WEB_SEO_SERVICE_ACCOUNT)return {status:"not_configured",range,reports:[]};
 try{
 const token=await accessToken(env,fetcher,"search_console");
 const endpoint="https://www.googleapis.com/webmasters/v3/sites/"+encodeURIComponent("https://"+host+"/")+"/searchAnalytics/query";
 const reports=await Promise.all(searchDimensions.map(async d=>{try{return parseSearch(await json(fetcher,endpoint,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(searchRequest(d,days))}),d,host);}catch{return {dimension:d,status:"unavailable",rows:[]};}}));
 return {status:reports.some(r=>r.status!=="unavailable")?"reported":"unavailable",range,reports};
 }catch{return {status:"unavailable",range,reports:[]};}
}
export async function websiteSeo(host:string,days:7|28|90,strategy:"mobile"|"desktop",env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch){
 if(normalizeDomain(host)!==host||![7,28,90].includes(days)||!["mobile","desktop"].includes(strategy))throw Error("Invalid SEO scan");
 const [technical,search]=await Promise.all([pageSpeed(host,strategy,env,fetcher),searchConsole(host,days,env,fetcher)]);
 return {hostname:host,days,strategy,technical,search,readOnly:true,checkedAt:new Date().toISOString()};
}
