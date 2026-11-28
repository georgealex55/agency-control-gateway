import {hkdfSync,randomBytes} from "node:crypto";
import {ownerSocialStorageConfigured,socialMetaWorkspaceDb} from "./reach-social-owner-db";
import {vaultEncryptionReady} from "./reach-neon-vault-crypto";
import {sealGoogle,openGoogle} from "./reach-google-oauth";
import {validateGoogleDeveloper} from "./reach-google-developer-contract";
import {GOOGLE_CALLBACK,googleConfigured} from "./reach-google-contract";
type Row={project_id:string;client_id:string;sealed_config:string;enabled:boolean;updated_at:string|Date};
function rootEnv(env:NodeJS.ProcessEnv=process.env):NodeJS.ProcessEnv{
 if(!vaultEncryptionReady(env))throw Error("Owner vault key unavailable");
 const root=Buffer.from(env.REACH_VAULT_ENCRYPTION_KEY!,"base64url");
 const derived=Buffer.from(hkdfSync("sha256",root,Buffer.from("reach-google-developer-v1"),Buffer.from("oauth-configuration"),32)).toString("base64url");
 return {NODE_ENV:env.NODE_ENV,REACH_GOOGLE_TOKEN_KEY:derived};
}
const ctx=(w:string,id:string)=>w+":developer-config:"+id;
function approved(w:string){return ownerSocialStorageConfigured()&&w===process.env.REACH_SOCIAL_OWNER_WORKSPACE_ID;}
async function read(w:string):Promise<Row|null>{
 if(!approved(w))throw Error("Workspace unavailable");
 const db=await socialMetaWorkspaceDb(w);
 const rows=await db.query("SELECT project_id,client_id,sealed_config,enabled,updated_at::text AS updated_at FROM public.reach_google_developer_config WHERE workspace_id=$1::uuid LIMIT 1",[w]);
 if(!Array.isArray(rows))throw Error("Configuration unavailable");
 return rows[0]||null;
}
function secrets(w:string,r:Row,env:NodeJS.ProcessEnv=process.env){
 const raw=JSON.parse(openGoogle(r.sealed_config,ctx(w,r.client_id),rootEnv(env)));
 const validated=validateGoogleDeveloper({projectId:r.project_id,clientId:r.client_id,clientSecret:raw.clientSecret});
 if(typeof raw.tokenKey!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(raw.tokenKey)||Buffer.from(raw.tokenKey,"base64url").length!==32)throw Error("Invalid stored encryption key");
 return {...validated,tokenKey:raw.tokenKey as string};
}
export async function googleDeveloperStatus(w:string){
 const base={replacementAllowed:false,replacementReason:"Save a developer application first.",callbackUrl:GOOGLE_CALLBACK,masterEnabled:process.env.REACH_GOOGLE_OAUTH_ENABLED==="true",vaultReady:vaultEncryptionReady(),storageReady:false,configured:false,enabled:false,projectId:null as string|null,clientIdMasked:null as string|null,source:"none",updatedAt:null as string|null};
 if(!approved(w)||!base.vaultReady)return base;
 try{
 const r=await read(w);
 if(r){
  secrets(w,r);
  const saved={...base,storageReady:true,configured:true,enabled:r.enabled,projectId:r.project_id,clientIdMasked:"••••"+r.client_id.split(".")[0].slice(-4),source:"vault",updatedAt:new Date(r.updated_at).toISOString()};
  // A replacement-count failure must not conceal a successfully decrypted saved configuration.
  try{const counts=await googleReplacementCounts(w);const reason=replacementReason(r.enabled,counts);return {...saved,replacementAllowed:reason===null,replacementReason:reason};}
  catch{return {...saved,replacementAllowed:false,replacementReason:"Cannot verify existing grants. Replacement is blocked until status is available."};}
 }
 return {...base,storageReady:true,configured:!!process.env.REACH_GOOGLE_CLIENT_ID&&!!process.env.REACH_GOOGLE_CLIENT_SECRET,enabled:googleConfigured(),source:process.env.REACH_GOOGLE_CLIENT_ID?"environment":"none"};
 }catch{return base;}
}
async function verifySavedGoogleDeveloper(w:string,v:ReturnType<typeof validateGoogleDeveloper>,tokenKey:string){
 const persisted=await read(w);
 if(!persisted||persisted.project_id!==v.projectId||persisted.client_id!==v.clientId)throw new GoogleStorageVerificationError();
 const decrypted=secrets(w,persisted);
 if(decrypted.clientSecret!==v.clientSecret||decrypted.tokenKey!==tokenKey)throw new GoogleStorageVerificationError();
 return googleDeveloperStatus(w);
}
export class GoogleStorageVerificationError extends Error{
 constructor(){super("Google credential storage could not be confirmed. Retry the same credentials; no reset is needed.");this.name="GoogleStorageVerificationError";}
}
export async function saveGoogleDeveloper(w:string,input:unknown){
 if(!approved(w))throw Error("Workspace unavailable");
 const v=validateGoogleDeveloper(input),db=await socialMetaWorkspaceDb(w),old=await read(w);
 // Keep the client identity and token encryption key stable; never silently replace a configured app.
 if(old&&(old.client_id!==v.clientId||old.project_id!==v.projectId))throw Error("Different application requires a separate migration.");
 if(old?.enabled&&secrets(w,old).clientSecret!==v.clientSecret)throw Error("Pause authorization before rotating the same client secret.");
 if(!old&&process.env.REACH_GOOGLE_CLIENT_ID&&process.env.REACH_GOOGLE_CLIENT_ID!==v.clientId)throw Error("Existing environment application must be preserved.");
 if(!old&&process.env.REACH_GOOGLE_CLIENT_ID&&(!/^[A-Za-z0-9_-]{43}$/.test(process.env.REACH_GOOGLE_TOKEN_KEY||"")||Buffer.from(process.env.REACH_GOOGLE_TOKEN_KEY||"","base64url").length!==32))throw Error("Existing environment key must be preserved.");
 const tokenKey=old?secrets(w,old).tokenKey:process.env.REACH_GOOGLE_CLIENT_ID?process.env.REACH_GOOGLE_TOKEN_KEY!:randomBytes(32).toString("base64url");
 const sealed=sealGoogle(JSON.stringify({clientSecret:v.clientSecret,tokenKey}),ctx(w,v.clientId),rootEnv());
 const result=await db.query("INSERT INTO public.reach_google_developer_config(workspace_id,project_id,client_id,sealed_config,enabled) VALUES($1::uuid,$2,$3,$4,false) ON CONFLICT(workspace_id) DO UPDATE SET sealed_config=EXCLUDED.sealed_config,updated_at=now() WHERE reach_google_developer_config.client_id=EXCLUDED.client_id AND reach_google_developer_config.project_id=EXCLUDED.project_id AND reach_google_developer_config.sealed_config=$5 AND reach_google_developer_config.enabled=$6 RETURNING workspace_id",[w,v.projectId,v.clientId,sealed,old?.sealed_config||"",old?.enabled??false]);
 if(!Array.isArray(result)||result.length!==1)throw Error("Configuration changed concurrently; reload.");
 return verifySavedGoogleDeveloper(w,v,tokenKey);
}
export async function enableGoogleDeveloper(w:string,enabled:boolean){
 if(!approved(w))throw Error("Workspace unavailable");
 const row=await read(w);if(!row)throw Error("Save application first");secrets(w,row);
 if(enabled&&process.env.REACH_GOOGLE_OAUTH_ENABLED!=="true")throw Error("Master activation gate is disabled.");
 const db=await socialMetaWorkspaceDb(w);
 // Read all three tables before enabling. No migration DDL from runtime.
 if(enabled)await db.query("SELECT (SELECT count(*) FROM public.reach_google_flows) AS flows,(SELECT count(*) FROM public.reach_google_pending) AS pending,(SELECT count(*) FROM public.reach_google_connections) AS connections");
 const result=await db.query("UPDATE public.reach_google_developer_config SET enabled=$2,updated_at=now() WHERE workspace_id=$1::uuid AND sealed_config=$3 RETURNING workspace_id",[w,enabled,row.sealed_config]);
 if(!Array.isArray(result)||result.length!==1)throw Error("Configuration changed concurrently");
 return googleDeveloperStatus(w);
}
/** Request-local snapshot, no global env mutation. Fail closed on unavailable saved configuration. */
export async function resolvedGoogleEnv(w:string,env:NodeJS.ProcessEnv=process.env):Promise<NodeJS.ProcessEnv>{
 if(!approved(w)||env.REACH_GOOGLE_OAUTH_ENABLED!=="true")return {...env,REACH_GOOGLE_OAUTH_ENABLED:"false"};
 try{
 const r=await read(w);
 if(!r)return env;
 const s=secrets(w,r,env);
 return {...env,REACH_GOOGLE_CLIENT_ID:s.clientId,REACH_GOOGLE_CLIENT_SECRET:s.clientSecret,REACH_GOOGLE_TOKEN_KEY:s.tokenKey,REACH_GOOGLE_OAUTH_ENABLED:r.enabled?"true":"false"};
 }catch{return {...env,REACH_GOOGLE_OAUTH_ENABLED:"false"};}
}

type ReplacementCounts={connections:number;pending:number;flows:number};
export function replacementReason(enabled:boolean,counts:ReplacementCounts):string|null{
 if(enabled)return "Pause Google authorization first.";
 if(counts.connections>0)return "Existing Google connections must be preserved. Client replacement is blocked while any are saved.";
 if(counts.pending>0)return "Finish the pending Google resource selection or allow it to expire before replacing the client.";
 if(counts.flows>0)return "An authorization attempt is still active. Allow it to expire before replacing the client.";
 return null;
}
async function googleReplacementCounts(w:string):Promise<ReplacementCounts>{
 const db=await socialMetaWorkspaceDb(w),result=await db.query("SELECT (SELECT count(*) FROM public.reach_google_connections WHERE workspace_id=$1::uuid) AS connections,(SELECT count(*) FROM public.reach_google_pending WHERE workspace_id=$1::uuid AND expires_at>now()) AS pending,(SELECT count(*) FROM public.reach_google_flows WHERE workspace_id=$1::uuid AND expires_at>now()) AS flows",[w]);
 if(!Array.isArray(result)||result.length!==1)throw Error("Cannot verify existing Google connections");
 const row=result[0],counts={connections:Number(row.connections),pending:Number(row.pending),flows:Number(row.flows)};
 if(Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0))throw Error("Cannot verify existing Google connections");
 return counts;
}
export class GoogleReplacementBlocked extends Error{
 constructor(message:string){super(message);this.name="GoogleReplacementBlocked";}
}
/** Explicit same-project replacement. Never disconnect saved Google resources or change unrelated credentials. */
export async function replaceGoogleDeveloper(w:string,input:unknown,expectedUpdatedAt:string){
 if(!approved(w))throw Error("Workspace unavailable");
 const v=validateGoogleDeveloper(input),old=await read(w);
 if(!old)throw new GoogleReplacementBlocked("No saved Google application to replace.");
 if(new Date(old.updated_at).toISOString()!==expectedUpdatedAt)throw new GoogleReplacementBlocked("Google configuration changed. Refresh before replacing.");
 if(old.project_id!==v.projectId)throw new GoogleReplacementBlocked("Use a new OAuth client from the existing Google Cloud project.");
 if(old.client_id===v.clientId)throw new GoogleReplacementBlocked("This is the existing OAuth client. Use Save Google configuration to update its secret.");
 const reason=replacementReason(old.enabled,await googleReplacementCounts(w));if(reason)throw new GoogleReplacementBlocked(reason);
 const tokenKey=secrets(w,old).tokenKey;
 const sealed=sealGoogle(JSON.stringify({clientSecret:v.clientSecret,tokenKey}),ctx(w,v.clientId),rootEnv());
 const db=await socialMetaWorkspaceDb(w);
 // Pausing serializes with new flow/stage/select writes that lock this configuration row.
 // Recheck the saved config and absence of live attempts/grants atomically. Expired records
 // are left intact until normal expiry cleanup; their old client hash cannot authorize the new app.
 const result=await db.query("UPDATE public.reach_google_developer_config c SET client_id=$2,sealed_config=$3,enabled=false,updated_at=now() WHERE c.workspace_id=$1::uuid AND c.project_id=$4 AND c.client_id=$5 AND c.sealed_config=$6 AND c.updated_at=$7::timestamptz AND NOT c.enabled AND NOT EXISTS(SELECT 1 FROM public.reach_google_connections WHERE workspace_id=$1::uuid) AND NOT EXISTS(SELECT 1 FROM public.reach_google_pending WHERE workspace_id=$1::uuid AND expires_at>now()) AND NOT EXISTS(SELECT 1 FROM public.reach_google_flows WHERE workspace_id=$1::uuid AND expires_at>now()) RETURNING workspace_id",[w,v.clientId,sealed,v.projectId,old.client_id,old.sealed_config,old.updated_at]);
 if(!Array.isArray(result)||result.length!==1)throw new GoogleReplacementBlocked("Configuration changed or Google activity exists. Refresh and retry.");
 return verifySavedGoogleDeveloper(w,v,tokenKey);
}
