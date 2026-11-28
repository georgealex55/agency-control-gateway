import {createSign} from "node:crypto";
import {normalizeDomain} from "./reach-infrastructure";
type Obj=Record<string,any>;
const obj=(v:unknown):Obj=>v&&typeof v==="object"&&!Array.isArray(v)?v as Obj:{};
const numeric=(v:unknown):number|null=>{if(typeof v!=="number"&&!(typeof v==="string"&&/^\d+(\.\d+)?$/.test(v)))return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;};
const boundedText=(v:unknown)=>typeof v==="string"?v.slice(0,200):"Unknown";
async function json(fetcher:typeof fetch,url:string,init:RequestInit={}){
 const r=await fetcher(url,{...init,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error("Provider unavailable");
 const body=await r.text();if(body.length>2000000)throw Error("Report too large");return obj(JSON.parse(body));
}
export async function publicRank(host:string,fetcher:typeof fetch=fetch){
 if(normalizeDomain(host)!==host)throw Error("Invalid hostname");
 try{
 const data=await json(fetcher,"https://tranco-list.eu/api/ranks/domain/"+encodeURIComponent(host));
 if(data.domain!==undefined&&data.domain!==host)throw Error("Unexpected domain");
 if(!Array.isArray(data.ranks))throw Error("Unexpected ranking response");
 const history=data.ranks.flatMap((raw:unknown)=>{const r=obj(raw),rank=numeric(r.rank);return typeof r.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&rank!==null&&Number.isSafeInteger(rank)&&rank>0?[{date:r.date,rank}]:[];}).sort((a:{date:string},b:{date:string})=>a.date.localeCompare(b.date)).slice(-30) as {date:string;rank:number}[];
 return {source:"tranco",status:history.length?"available":"not_ranked",history,rank:history.at(-1)?.rank??null};
 }catch{return {source:"tranco",status:"unavailable",history:[],rank:null};}
}
export const REPORTS=[
 {id:"overview",dim:[],metrics:["activeUsers","newUsers","sessions","screenPageViews","engagementRate","averageSessionDuration","keyEvents"]},
 {id:"daily",dim:["date"],metrics:["sessions","screenPageViews"]},
 {id:"country",dim:["country"],metrics:["sessions"]},
 {id:"region",dim:["region"],metrics:["sessions"]},
 {id:"device",dim:["deviceCategory"],metrics:["sessions"]},
 {id:"language",dim:["language"],metrics:["sessions"]},
 {id:"age",dim:["userAgeBracket"],metrics:["activeUsers"]},
 {id:"gender",dim:["userGender"],metrics:["activeUsers"]},
 {id:"channel",dim:["sessionDefaultChannelGroup"],metrics:["sessions"]},
 {id:"source",dim:["sessionSource","sessionMedium"],metrics:["sessions"]},
 {id:"outbound",dim:["linkDomain"],metrics:["eventCount"]},
 {id:"browser",dim:["browser"],metrics:["sessions"]},
 {id:"os",dim:["operatingSystem"],metrics:["sessions"]},
] as const;
type Spec=typeof REPORTS[number];
export function gaRequest(host:string,days:7|28|90,spec:Spec){
 if(normalizeDomain(host)!==host)throw Error("Invalid hostname");
 const exact=(fieldName:string,value:string)=>({filter:{fieldName,stringFilter:{matchType:"EXACT",value,caseSensitive:false}}});
 const filter=exact("hostName",host);
 return {dateRanges:[{startDate:days+"daysAgo",endDate:"yesterday"}],dimensions:spec.dim.map(name=>({name})),metrics:spec.metrics.map(name=>({name})),dimensionFilter:spec.id==="outbound"?{andGroup:{expressions:[filter,exact("eventName","click"),exact("outbound","true")]}}:filter,limit:spec.id==="daily"?days:25,orderBys:spec.id==="daily"?[{dimension:{dimensionName:"date"}}]:[{metric:{metricName:spec.metrics[0]},desc:true}],keepEmptyRows:false};
}
export function parseGaReport(raw:unknown,spec:Spec){
 const d=obj(raw),meta=obj(d.metadata),thresholded=meta.subjectToThresholding===true;
 if(!Array.isArray(d.metricHeaders)||d.metricHeaders.map((x:Obj)=>x.name).join(",")!==spec.metrics.join(",")||(d.dimensionHeaders||[]).map((x:Obj)=>x.name).join(",")!==spec.dim.join(","))throw Error("Unexpected report schema");
 // Do not expose even partial demographic rows when privacy thresholds apply.
 const rows=thresholded&&(spec.id==="age"||spec.id==="gender")?[]:(Array.isArray(d.rows)?d.rows:[]).slice(0,90).map((raw:unknown)=>{const r=obj(raw);return {labels:(Array.isArray(r.dimensionValues)?r.dimensionValues:[]).slice(0,spec.dim.length).map((x:Obj)=>boundedText(x.value)),values:(Array.isArray(r.metricValues)?r.metricValues:[]).slice(0,spec.metrics.length).map((x:Obj)=>numeric(x.value))};});
 return {id:spec.id,status:thresholded?"thresholded":rows.length?"available":"no_rows",metrics:[...spec.metrics],rows,rowCount:numeric(d.rowCount),partial:thresholded||meta.dataLossFromOtherRow===true||Boolean(meta.samplingMetadatas?.length)||(numeric(d.rowCount)??0)>rows.length};
}
function propertyFor(host:string,env:NodeJS.ProcessEnv){
 try{const map=obj(JSON.parse(env.REACH_WEB_ANALYTICS_PROPERTIES||"{}"));const id=Object.hasOwn(map,host)?map[host]:null;return typeof id==="string"&&/^\d{1,20}$/.test(id)?id:null;}catch{return null;}
}
async function accessToken(env:NodeJS.ProcessEnv,fetcher:typeof fetch){
 const account=obj(JSON.parse(env.REACH_WEB_ANALYTICS_SERVICE_ACCOUNT||"{}"));
 if(typeof account.client_email!=="string"||!account.client_email.endsWith(".gserviceaccount.com")||typeof account.private_key!=="string")throw Error("Analytics credentials unavailable");
 const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString("base64url"),now=Math.floor(Date.now()/1000);
 const unsigned=encode({alg:"RS256",typ:"JWT"})+"."+encode({iss:account.client_email,scope:"https://www.googleapis.com/auth/analytics.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+300});
 const signature=createSign("RSA-SHA256").update(unsigned).sign(account.private_key,"base64url");
 const token=await json(fetcher,"https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:unsigned+"."+signature})});
 if(typeof token.access_token!=="string"||token.access_token.length>8192||!token.access_token)throw Error("Analytics token unavailable");
 return token.access_token;
}
export async function websiteAnalytics(host:string,days:7|28|90,env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch){
 if(normalizeDomain(host)!==host||![7,28,90].includes(days))throw Error("Invalid report");
 const ranking=publicRank(host,fetcher),property=propertyFor(host,env);
 let measuredStatus="not_configured",reports:ReturnType<typeof parseGaReport>[]=[];
 if(property&&env.REACH_WEB_ANALYTICS_SERVICE_ACCOUNT){
 try{
 const token=await accessToken(env,fetcher);
 const run=async(spec:Spec)=>{try{return parseGaReport(await json(fetcher,"https://analyticsdata.googleapis.com/v1beta/properties/"+property+":runReport",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(gaRequest(host,days,spec))}),spec);}catch{return {id:spec.id,status:"unavailable",metrics:[...spec.metrics],rows:[],rowCount:null,partial:true};}};
 // Bounded concurrency and fixed reports; no arbitrary provider queries.
 for(let i=0;i<REPORTS.length;i+=5)reports.push(...await Promise.all(REPORTS.slice(i,i+5).map(run)));
 measuredStatus=reports.some(r=>r.status!=="unavailable")?"reported":"unavailable";
 }catch{measuredStatus="unavailable";}
 }
 return {hostname:host,days,checkedAt:new Date().toISOString(),public:await ranking,measured:{source:"google_analytics_4",status:measuredStatus,reports},readOnly:true};
}
