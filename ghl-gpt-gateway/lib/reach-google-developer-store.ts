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
 return {REACH_GOOGLE_TOKEN_KEY:derived};
}
const ctx=(w:string,id:string)=>w+":developer-config:"+id;
function approved(w:string){return ownerSocialStorageConfigured()&&w===process.env.REACH_SOCIAL_OWNER_WORKSPACE_ID;}
async function read(w:string):Promise<Row|null>{
 if(!approved(w))throw Error("Workspace unavailable");
 const db=await socialMetaWorkspaceDb(w);
 const rows=await db.query("SELECT project_id,client_id,sealed_config,enabled,updated_at FROM public.reach_google_developer_config WHERE workspace_id=$1::uuid LIMIT 1",[w]);
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
 const base={callbackUrl:GOOGLE_CALLBACK,masterEnabled:process.env.REACH_GOOGLE_OAUTH_ENABLED==="true",vaultReady:vaultEncryptionReady(),storageReady:false,configured:false,enabled:false,projectId:null as string|null,clientIdMasked:null as string|null,source:"none",updatedAt:null as string|null};
 if(!approved(w)||!base.vaultReady)return base;
 try{
 const r=await read(w);
 if(r){secrets(w,r);return {...base,storageReady:true,configured:true,enabled:r.enabled,projectId:r.project_id,clientIdMasked:"••••"+r.client_id.slice(-36,-27),source:"vault",updatedAt:new Date(r.updated_at).toISOString()};}
 return {...base,storageReady:true,configured:!!process.env.REACH_GOOGLE_CLIENT_ID&&!!process.env.REACH_GOOGLE_CLIENT_SECRET,enabled:googleConfigured(),source:process.env.REACH_GOOGLE_CLIENT_ID?"environment":"none"};
 }catch{return base;}
}
export async function saveGoogleDeveloper(w:string,input:unknown){
 if(!approved(w))throw Error("Workspace unavailable");
 const v=validateGoogleDeveloper(input),db=await socialMetaWorkspaceDb(w),old=await read(w);
 // Keep the client identity and token encryption key stable; never silently replace a configured app.
 if(old&&(old.client_id!==v.clientId||old.project_id!==v.projectId))throw Error("Different application requires a separate migration.");
 if(!old&&process.env.REACH_GOOGLE_CLIENT_ID&&process.env.REACH_GOOGLE_CLIENT_ID!==v.clientId)throw Error("Existing environment application must be preserved.");
 if(!old&&process.env.REACH_GOOGLE_CLIENT_ID&&!/^[A-Za-z0-9_-]{43}$/.test(process.env.REACH_GOOGLE_TOKEN_KEY||""))throw Error("Existing environment key must be preserved.");
 const tokenKey=old?secrets(w,old).tokenKey:process.env.REACH_GOOGLE_CLIENT_ID?process.env.REACH_GOOGLE_TOKEN_KEY!:randomBytes(32).toString("base64url");
 const sealed=sealGoogle(JSON.stringify({clientSecret:v.clientSecret,tokenKey}),ctx(w,v.clientId),rootEnv());
 const result=await db.query("INSERT INTO public.reach_google_developer_config(workspace_id,project_id,client_id,sealed_config,enabled) VALUES($1::uuid,$2,$3,$4,false) ON CONFLICT(workspace_id) DO UPDATE SET sealed_config=EXCLUDED.sealed_config,updated_at=now() WHERE reach_google_developer_config.client_id=EXCLUDED.client_id AND reach_google_developer_config.project_id=EXCLUDED.project_id AND reach_google_developer_config.sealed_config=$5 RETURNING workspace_id",[w,v.projectId,v.clientId,sealed,old?.sealed_config||""]);
 if(!Array.isArray(result)||result.length!==1)throw Error("Configuration changed concurrently; reload.");
 return googleDeveloperStatus(w);
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
