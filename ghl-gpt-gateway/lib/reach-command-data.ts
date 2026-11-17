/**
 * Strict, tenant-bound read models for the REACH owner dashboard.
 * Never cast untrusted JSON into metrics or substitute zero for failed requests.
 */
export type CommandWorkspace={id:string;name:string;slug:string};
export type CommandInsights={
 workspaceId:string;internalOnly:true;drafts:{draft:number;planned:number;approved:number};
 scheduledNextSevenDays:number;overdueApproved:number;
 metricsAvailable:false;externalReach:null;externalEngagement:null
};
export type CommandMonitor={
 workspaceId:string;externalPublishing:false;autoRecoveryEnabled:false;
 summary:{queuedOverHour:number;leasesOverdue:number;retryScheduled:number;retryExhausted:number;readyPending:number;outdatedRevision:number;attention:number}
};
export type CommandProvider={id:string;name:string;connectionStatus:string;connectedAccounts:number;publishingEnabled:false};
export type CommandProviders={workspaceId:string;connections:CommandProvider[];publishingEnabled:false;realMetricsAvailable:false};
export class CommandDataError extends Error {
 constructor(public readonly status:number, message:string){super(message);this.name="CommandDataError";}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==="object"&&!Array.isArray(v);
const validCount=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
const assertValid=(value:boolean):void=>{if(!value)throw new CommandDataError(422,"Invalid staging data response");};
const isCountObject=(v:unknown,keys:readonly string[]):v is Record<string,number>=>
 isRecord(v)&&keys.every(k=>validCount(v[k]));
export function parseCommandWorkspaces(raw:unknown):CommandWorkspace[]{
 assertValid(isRecord(raw)&&raw.configured===true&&Array.isArray(raw.workspaces)&&raw.workspaces.length<=100);
 const list=(raw as {workspaces:unknown[]}).workspaces;
 const seen=new Set<string>();
 const safe:CommandWorkspace[]=[];
 for(const entry of list){
  assertValid(isRecord(entry)&&typeof entry.id==="string"&&uuid.test(entry.id)&&
   typeof entry.name==="string"&&entry.name.trim().length>0&&entry.name.length<=120&&
   typeof entry.slug==="string"&&entry.slug.length<=64&&!seen.has(entry.id));
  const r=entry as Record<string,string>;
  seen.add(r.id);safe.push({id:r.id,name:r.name,slug:r.slug});
 }
 return safe;
}
export function parseCommandInsights(raw:unknown,workspaceId:string):CommandInsights{
 assertValid(isRecord(raw)&&raw.workspaceId===workspaceId&&raw.internalOnly===true&&
  raw.metricsAvailable===false&&raw.externalReach===null&&raw.externalEngagement===null&&
  isCountObject(raw.drafts,["draft","planned","approved"])&&
  validCount(raw.scheduledNextSevenDays)&&validCount(raw.overdueApproved));
 const x=raw as Record<string,unknown>,drafts=x.drafts as Record<string,number>;
 return {workspaceId,internalOnly:true,drafts:{draft:drafts.draft,planned:drafts.planned,approved:drafts.approved},
  scheduledNextSevenDays:x.scheduledNextSevenDays as number,overdueApproved:x.overdueApproved as number,
  metricsAvailable:false,externalReach:null,externalEngagement:null};
}
const summaryKeys=["queuedOverHour","leasesOverdue","retryScheduled","retryExhausted","readyPending","outdatedRevision","attention"] as const;
export function parseCommandMonitor(raw:unknown,workspaceId:string):CommandMonitor{
 assertValid(isRecord(raw)&&raw.workspaceId===workspaceId&&raw.externalPublishing===false&&
  raw.autoRecoveryEnabled===false&&isCountObject(raw.summary,summaryKeys));
 const counts=(raw as {summary:Record<string,number>}).summary;
 return {workspaceId,externalPublishing:false,autoRecoveryEnabled:false,
  summary:{queuedOverHour:counts.queuedOverHour,leasesOverdue:counts.leasesOverdue,
   retryScheduled:counts.retryScheduled,retryExhausted:counts.retryExhausted,
   readyPending:counts.readyPending,outdatedRevision:counts.outdatedRevision,attention:counts.attention}};
}
const states=new Set(["disconnected","missing_config","authorization_pending","read_only","expired","revoked","error"]);
export function parseCommandProviders(raw:unknown,workspaceId:string):CommandProviders{
 assertValid(isRecord(raw)&&raw.workspaceId===workspaceId&&raw.publishingEnabled===false&&
  raw.realMetricsAvailable===false&&Array.isArray(raw.connections)&&raw.connections.length<=40);
 const list=(raw as {connections:unknown[]}).connections;
 const seen=new Set<string>();const connections:CommandProvider[]=[];
 for(const item of list){
  assertValid(isRecord(item)&&typeof item.id==="string"&&item.id.length<=80&&
   item.id.length>0&&!seen.has(item.id)&&typeof item.name==="string"&&
   item.name.length>0&&item.name.length<=120&&typeof item.connectionStatus==="string"&&
   states.has(item.connectionStatus)&&validCount(item.connectedAccounts)&&item.publishingEnabled===false);
  const p=item as Record<string,unknown>;seen.add(p.id as string);
  assertValid((p.connectedAccounts as number)===0||p.connectionStatus==="read_only");
  connections.push({id:p.id as string,name:p.name as string,connectionStatus:p.connectionStatus as string,
   connectedAccounts:p.connectedAccounts as number,publishingEnabled:false});
 }
 return {workspaceId,connections,publishingEnabled:false,realMetricsAvailable:false};
}
export type CommandErrorAction="sign_in"|"retry"|"configure"|"select_workspace";
export function commandErrorInfo(error:unknown):{message:string;action:CommandErrorAction}{
 if(error instanceof CommandDataError){
  if(error.status===401)return {message:"Owner session expired or access was denied.",action:"sign_in"};
  if(error.status===403)return {message:"This feature is not enabled for the current staging branch.",action:"configure"};
  if(error.status===404)return {message:"This workspace or layout was not found.",action:"select_workspace"};
  if(error.status===422)return {message:"The staging service returned an invalid or mismatched workspace response.",action:"retry"};
  if(error.status===503)return {message:"The staging storage or service is unavailable.",action:"retry"};
 }
 return {message:"Could not load current staging data. Check connectivity and retry.",action:"retry"};
}
export async function loadCommandJson<T>(
 url:string,signal:AbortSignal,validate:(value:unknown)=>T,request:typeof fetch=fetch
):Promise<T>{
 let response:Response;
 try{response=await request(url,{credentials:"same-origin",cache:"no-store",signal});}
 catch(e){if(signal.aborted)throw e;throw new CommandDataError(0,"Network request failed");}
 if(!response.ok)throw new CommandDataError(response.status,"Staging request refused");
 let json:unknown;
 try{json=await response.json();}catch{throw new CommandDataError(422,"Unparseable staging data");}
 return validate(json);
}
