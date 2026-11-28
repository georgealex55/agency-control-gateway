import {randomUUID} from "node:crypto";
import {ownerSocialStorageConfigured,socialMetaWorkspaceDb} from "./reach-social-owner-db";
import {googleConfigured,groupFor,type GoogleGroup} from "./reach-google-contract";
import {digest,openGoogle,sealGoogle,refreshGoogle,discoverGoogle,type Candidate} from "./reach-google-oauth";
type Row=Record<string,any>;
const rows=(v:unknown):Row[]=>{if(!Array.isArray(v))throw Error("Google storage unavailable");return v;};
export function approvedGoogleWorkspace(w:unknown):w is string{return typeof w==="string"&&ownerSocialStorageConfigured()&&w===process.env.REACH_SOCIAL_OWNER_WORKSPACE_ID;}
const clientHash=()=>digest(process.env.REACH_GOOGLE_CLIENT_ID||"");
const context=(w:string,id:string,kind:string)=>w+":"+kind+":"+id+":"+clientHash();
async function db(w:string){if(!approvedGoogleWorkspace(w)||!googleConfigured())throw Error("Google setup required");return socialMetaWorkspaceDb(w);}
export async function googleDomain(w:string,id:string|null){
 if(!id)return null;const d=await socialMetaWorkspaceDb(w),r=rows(await d.query("SELECT hostname FROM public.agency_platform_domains WHERE workspace_id=$1::uuid AND id=$2::uuid LIMIT 1",[w,id]));if(r.length!==1)throw Error("Domain unavailable");return String(r[0].hostname);
}
export async function createGoogleFlow(w:string,group:GoogleGroup,domainId:string|null,state:string,browser:string,verifier:string){
 const d=await db(w);const hash=digest(state);
 await d.query("DELETE FROM public.reach_google_flows WHERE workspace_id=$1::uuid AND expires_at<=now()",[w]);
 const out=rows(await d.query("INSERT INTO public.reach_google_flows(workspace_id,state_hash,browser_hash,group_id,domain_id,sealed_verifier,client_hash,expires_at) SELECT $1::uuid,$2,$3,$4,$5::uuid,$6,$7,now()+interval '10 minutes' WHERE (SELECT count(*) FROM public.reach_google_flows WHERE workspace_id=$1::uuid)<10 RETURNING state_hash",[w,hash,digest(browser),group,domainId,sealGoogle(verifier,context(w,hash,"flow")),clientHash()]));
 if(out.length!==1)throw Error("Too many authorization attempts");
}
export async function consumeGoogleFlow(w:string,state:string,browser:string){
 const d=await db(w),hash=digest(state);
 const r=rows(await d.query("DELETE FROM public.reach_google_flows WHERE workspace_id=$1::uuid AND state_hash=$2 AND browser_hash=$3 AND client_hash=$4 AND expires_at>now() RETURNING group_id,domain_id,sealed_verifier",[w,hash,digest(browser),clientHash()]))[0];
 if(!r||!groupFor(r.group_id))throw Error("Invalid or expired authorization");
 return {group:r.group_id as GoogleGroup,domainId:r.domain_id as string|null,verifier:openGoogle(r.sealed_verifier,context(w,hash,"flow"))};
}
export async function stageGoogle(w:string,group:GoogleGroup,domainId:string|null,grant:{subject:string;email:string;refresh:string;scopes:string[]}){
 const d=await db(w),id=randomUUID();
 await d.query("DELETE FROM public.reach_google_pending WHERE workspace_id=$1::uuid AND expires_at<=now()",[w]);
 const r=rows(await d.query("INSERT INTO public.reach_google_pending(id,workspace_id,group_id,domain_id,subject,email,scopes,sealed_refresh,client_hash,expires_at) SELECT $1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7::text[],$8,$9,now()+interval '15 minutes' WHERE (SELECT count(*) FROM public.reach_google_pending WHERE workspace_id=$2::uuid)<10 RETURNING id",[id,w,group,domainId,grant.subject,grant.email,grant.scopes,sealGoogle(grant.refresh,context(w,id,"pending")),clientHash()]));
 if(r.length!==1)throw Error("Too many pending grants");
}
export async function googleInventory(w:string){
 const d=await db(w);
 const pending=rows(await d.query("SELECT id,group_id,domain_id,email,expires_at FROM public.reach_google_pending WHERE workspace_id=$1::uuid AND client_hash=$2 AND expires_at>now() ORDER BY expires_at DESC LIMIT 10",[w,clientHash()]));
 const connections=rows(await d.query("SELECT id,group_id,domain_id,email,resource_id,resource_name,scopes,connected_at,client_hash=$2 AS client_matches FROM public.reach_google_connections WHERE workspace_id=$1::uuid ORDER BY connected_at DESC LIMIT 100",[w,clientHash()]));
 return {pending,connections};
}
async function pendingGrant(w:string,id:string){
 const d=await db(w),r=rows(await d.query("SELECT * FROM public.reach_google_pending WHERE workspace_id=$1::uuid AND id=$2::uuid AND client_hash=$3 AND expires_at>now() LIMIT 1",[w,id,clientHash()]))[0];
 if(!r||!groupFor(r.group_id))throw Error("Pending grant expired");
 const refresh=openGoogle(r.sealed_refresh,context(w,id,"pending"));
 const access=await refreshGoogle(refresh,r.group_id,r.subject);
 const host=await googleDomain(w,r.domain_id);
 return {d,r,refresh,access,host};
}
export async function pendingCandidates(w:string,id:string){
 const p=await pendingGrant(w,id);return discoverGoogle(p.r.group_id,p.access,p.r.subject,p.host);
}
export async function selectGoogle(w:string,id:string,resourceId:string){
 const p=await pendingGrant(w,id);
 const candidates=await discoverGoogle(p.r.group_id,p.access,p.r.subject,p.host);
 const selected=candidates.find(c=>c.id===resourceId);if(!selected)throw Error("Resource not verified");
 const newId=randomUUID(),sealed=sealGoogle(p.refresh,context(w,newId,"connection"));
 // Atomic consume + insert: conflicts roll back the whole statement, preserving existing connections.
 const result=rows(await p.d.query("WITH claimed AS (DELETE FROM public.reach_google_pending WHERE workspace_id=$1::uuid AND id=$2::uuid AND client_hash=$3 AND expires_at>now() RETURNING *) INSERT INTO public.reach_google_connections(id,workspace_id,group_id,domain_id,subject,email,resource_id,resource_name,scopes,sealed_refresh,client_hash) SELECT $4::uuid,workspace_id,group_id,domain_id,subject,email,$5,$6,scopes,$7,client_hash FROM claimed WHERE true ON CONFLICT(workspace_id,group_id,domain_id,resource_id,subject) DO UPDATE SET id=EXCLUDED.id,email=EXCLUDED.email,resource_name=EXCLUDED.resource_name,scopes=EXCLUDED.scopes,sealed_refresh=EXCLUDED.sealed_refresh,client_hash=EXCLUDED.client_hash,connected_at=now() RETURNING id",[w,id,clientHash(),newId,selected.id,selected.name,sealed]));
 if(result.length!==1)throw Error("Selection already used");
}
export async function googleConnectionAccess(w:string,id:string){
 const d=await db(w),r=rows(await d.query("SELECT * FROM public.reach_google_connections WHERE workspace_id=$1::uuid AND id=$2::uuid AND client_hash=$3 LIMIT 1",[w,id,clientHash()]))[0];
 if(!r||!groupFor(r.group_id))throw Error("Connection unavailable");
 const token=await refreshGoogle(openGoogle(r.sealed_refresh,context(w,id,"connection")),r.group_id,r.subject);
 return {token,group:r.group_id as GoogleGroup,subject:String(r.subject),domainId:r.domain_id as string|null,resourceId:String(r.resource_id),host:await googleDomain(w,r.domain_id)};
}
export async function verifyGoogleConnection(w:string,id:string){
 const c=await googleConnectionAccess(w,id);return (await discoverGoogle(c.group,c.token,c.subject,c.host)).some(v=>v.id===c.resourceId);
}
export async function disconnectGoogle(w:string,id:string){
 const d=await db(w);return rows(await d.query("DELETE FROM public.reach_google_connections WHERE workspace_id=$1::uuid AND id=$2::uuid RETURNING id",[w,id])).length===1;
}
export async function googleSiteAccess(w:string,host:string,group:"ga4"|"search_console"){
 if(!googleConfigured())return null;
 const d=await db(w),r=rows(await d.query("SELECT c.id FROM public.reach_google_connections c JOIN public.agency_platform_domains d ON d.id=c.domain_id AND d.workspace_id=c.workspace_id WHERE c.workspace_id=$1::uuid AND c.group_id=$2 AND d.hostname=$3 AND c.client_hash=$4 LIMIT 1",[w,group,host,clientHash()]))[0];
 if(!r)return null;
 const c=await googleConnectionAccess(w,r.id);if(c.host!==host||c.group!==group)throw Error("Selected resource mismatch");
 if(group==="ga4"&&!/^properties[/][0-9]{1,20}$/.test(c.resourceId))throw Error("Invalid property");
 if(group==="search_console"&&c.resourceId!=="https://"+host+"/")throw Error("Invalid search property");
 return {token:c.token,resourceId:c.resourceId};
}
