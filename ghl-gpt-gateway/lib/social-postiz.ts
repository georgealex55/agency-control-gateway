/* Server-only read adapter for the pinned gitroomhq/postiz-app public/v1 API.
   No POST/PUT/DELETE is implemented. Never reuse an API key across client organizations.
*/
export type PostizChannel={id:string;name:string;network:string;disabled:boolean};
type Fetcher=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
type Dict=Record<string,unknown>;
function dict(v:unknown):Dict|null{return v&&typeof v==="object"&&!Array.isArray(v)?v as Dict:null;}
function readBase(url:string):string {
 const u=new URL(url);
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.pathname!=="/")throw new Error("Postiz must be an HTTPS service root");
 const host=u.hostname.toLowerCase();
 if(host==="localhost"||host.endsWith(".local")||host.endsWith(".internal")||host==="127.0.0.1"||host==="0.0.0.0"||host==="169.254.169.254"||host==="[::1]"||/^(10|127|192\.168)\./.test(host)||/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host))throw new Error("Private Postiz origins are not allowed from the deployed portal");
 return u.origin;
}
export function postizStageConfigured(env:Record<string,string|undefined>):boolean {
 return Boolean(env.SOCIAL_POSTIZ_BASE_URL&&env.SOCIAL_POSTIZ_API_KEY&&env.SOCIAL_POSTIZ_ORG_ID&&env.SOCIAL_POSTIZ_WORKSPACE_ID);
}
export async function readPostiz(input:{baseUrl:string;key:string;organizationId:string;path:"/me"|"/integrations"|"/posts"|string;fetcher?:Fetcher}):Promise<unknown>{
 const base=readBase(input.baseUrl);
 const path=input.path;
 if(!["/me","/integrations","/posts"].includes(path)&&!/^\/analytics\/[A-Za-z0-9_-]{1,100}$/.test(path))throw Error("Unsupported Postiz read");
 const fetcher=input.fetcher??fetch;
 const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),8000);
 try {
  const response=await fetcher(base+"/api/public/v1"+path,{method:"GET",headers:{"Authorization":input.key,"Accept":"application/json"},redirect:"error",cache:"no-store",signal:ctl.signal});
  if(!response.ok)throw Error("Postiz rejected a read-only query");
  const value:unknown=await response.json();
  if(path==="/me"){
    const obj=dict(value),org=dict(obj?.organization);
    if(!org||org.id!==input.organizationId)throw Error("Postiz organization does not match the configured staging organization");
  }
  return value;
 }finally{clearTimeout(timer);}
}
export async function readPostizStage(workspaceId:string,analyticsId?:string){
 const env=process.env;
 if(!postizStageConfigured(env)||env.SOCIAL_POSTIZ_WORKSPACE_ID!==workspaceId)throw Error("Postiz staging organization not linked to this workspace");
 const config={baseUrl:env.SOCIAL_POSTIZ_BASE_URL!,key:env.SOCIAL_POSTIZ_API_KEY!,organizationId:env.SOCIAL_POSTIZ_ORG_ID!};
 await readPostiz({...config,path:"/me"});
 const raw=await readPostiz({...config,path:"/integrations"});
 const list=Array.isArray(raw)?raw:[];
 const channels:PostizChannel[]=list.slice(0,100).map(v=>dict(v)).filter((v):v is Dict=>v!==null).map(o=>({id:String(o.id||""),name:String(o.name||"").slice(0,120),network:String(o.identifier||"").slice(0,60),disabled:o.disabled===true})).filter(v=>v.id.length>0);
 let analytics:unknown=null;
 if(analyticsId){
  if(!channels.some(c=>c.id===analyticsId))throw Error("Channel not part of the selected staging organization");
  analytics=await readPostiz({...config,path:"/analytics/"+encodeURIComponent(analyticsId)});
 }
 return {configured:true,publishingEnabled:false,channels,analytics};
}
