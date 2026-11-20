import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {neon} from "@neondatabase/serverless";
import {neonVaultConfigured} from "@/lib/reach-neon-vault-store";
import {isMetaProvider,type MetaProvider} from "@/lib/social-meta-contract";

/**
 * Server-only Meta developer app setup for the single authenticated REACH owner.
 * Developer app secrets are encrypted at rest with dedicated per-provider AAD.
 * Customer access tokens use a DIFFERENT key and storage path.
 */
const OWNER="primary-owner";
type MetaAppRow={provider:MetaProvider;client_id:string;sealed_client_secret:string;updated_at:string|Date};
const aad=(provider:MetaProvider)=>Buffer.from("reach-vault:primary-owner:meta-app:"+provider+":v1","utf8");
function key():Buffer{
 const s=process.env.REACH_VAULT_ENCRYPTION_KEY||"";
 if(!/^[A-Za-z0-9_-]{43}$/.test(s))throw Error("Vault encryption key is unavailable");
 const b=Buffer.from(s,"base64url");
 if(b.length!==32)throw Error("Invalid vault encryption key");
 return b;
}
function db(){
 if(!neonVaultConfigured())throw Error("REACH owner vault is not configured");
 return neon(process.env.REACH_VAULT_DATABASE_URL!,{fetchOptions:{signal:AbortSignal.timeout(8000)}});
}
function encrypt(secret:string,provider:MetaProvider):string{
 if(typeof secret!=="string"||secret.length<8||secret.length>1024||/[\0\r\n]/.test(secret))
  throw Error("Meta app secret length or characters invalid");
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv);
 cipher.setAAD(aad(provider));
 const body=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);
 return "v1."+iv.toString("base64url")+"."+body.toString("base64url")+"."+cipher.getAuthTag().toString("base64url");
}
function decrypt(sealed:string,provider:MetaProvider):string{
 const parts=sealed.split(".");
 if(parts.length!==4||parts[0]!=="v1"||parts.some((v,i)=>i>0&&!/^[A-Za-z0-9_-]+$/.test(v)))
  throw Error("Meta app ciphertext is invalid");
 const iv=Buffer.from(parts[1],"base64url"),body=Buffer.from(parts[2],"base64url"),tag=Buffer.from(parts[3],"base64url");
 if(iv.length!==12||tag.length!==16||body.length<1||body.length>1500)throw Error("Invalid ciphertext size");
 const decipher=createDecipheriv("aes-256-gcm",key(),iv);
 decipher.setAAD(aad(provider));
 decipher.setAuthTag(tag);
 const secret=Buffer.concat([decipher.update(body),decipher.final()]).toString("utf8");
 if(secret.length<8||secret.length>1024)throw Error("Invalid decrypted app secret");
 return secret;
}
export function metaAppVaultReady():boolean{
 return process.env.VERCEL_ENV==="production"&&neonVaultConfigured();
}
export async function getOwnerMetaApp(provider:MetaProvider):Promise<{clientId:string;clientSecret:string;updatedAt:string}|null>{
 if(!metaAppVaultReady())return null;
 const rows=await db().query(
  "SELECT provider,client_id,sealed_client_secret,updated_at FROM reach_vault.owner_meta_apps WHERE owner_key=$1 AND provider=$2 LIMIT 1",
  [OWNER,provider]) as MetaAppRow[];
 const row=rows[0];
 if(!row||row.provider!==provider)return null;
 return{clientId:row.client_id,clientSecret:decrypt(row.sealed_client_secret,provider),
  updatedAt:new Date(row.updated_at).toISOString()};
}
export async function saveOwnerMetaApp(provider:MetaProvider,clientId:string,clientSecret:string){
 if(!isMetaProvider(provider)||!/^[0-9]{6,32}$/.test(clientId))throw Error("Meta app ID invalid");
 const ciphertext=encrypt(clientSecret,provider);
 if(!metaAppVaultReady())throw Error("Meta app vault unavailable");
 const rows=await db().query(
  "INSERT INTO reach_vault.owner_meta_apps(owner_key,provider,client_id,sealed_client_secret) VALUES($1,$2,$3,$4) "+
  "ON CONFLICT(owner_key,provider) DO UPDATE SET client_id=EXCLUDED.client_id,sealed_client_secret=EXCLUDED.sealed_client_secret,updated_at=now() "+
  "RETURNING provider,client_id,updated_at",
  [OWNER,provider,clientId,ciphertext]) as MetaAppRow[];
 const row=rows[0];
 if(!row)return null;
 return{provider,configured:true,clientIdMasked:"••••"+row.client_id.slice(-4),updatedAt:new Date(row.updated_at).toISOString()};
}
export async function removeOwnerMetaApp(provider:MetaProvider):Promise<boolean>{
 if(!metaAppVaultReady())throw Error("Meta app vault unavailable");
 const rows=await db().query(
  "DELETE FROM reach_vault.owner_meta_apps WHERE owner_key=$1 AND provider=$2 RETURNING provider",
  [OWNER,provider]);
 return Array.isArray(rows)&&rows.length===1;
}
/** Env overlay is request-local, never mutates process.env or exposes secrets to browser. */
export async function resolvedMetaEnv(provider:MetaProvider,env:NodeJS.ProcessEnv=process.env):Promise<NodeJS.ProcessEnv>{
 if(env.VERCEL_ENV!=="production"||!metaAppVaultReady())return env;
 let record:null|Awaited<ReturnType<typeof getOwnerMetaApp>>=null;
 try{record=await getOwnerMetaApp(provider);}catch{return env;}
 if(!record)return env;
 const prefix=provider==="facebook_pages"?"SOCIAL_META_FACEBOOK":"SOCIAL_META_INSTAGRAM";
 return{...env,[prefix+"_CLIENT_ID"]:record.clientId,[prefix+"_CLIENT_SECRET"]:record.clientSecret};
}
export async function ownerMetaAppSetup(provider:MetaProvider){
 const item=await getOwnerMetaApp(provider);
 return{provider,configured:Boolean(item),clientIdMasked:item?"••••"+item.clientId.slice(-4):null,
  updatedAt:item?.updatedAt||null};
}
