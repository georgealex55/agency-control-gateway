import {neon} from "@neondatabase/serverless";
import {vaultEncryptionReady,sealNeonVaultCredential,unsealNeonVaultCredential} from "@/lib/reach-neon-vault-crypto";
import {validateCustomerNeonUrl} from "@/lib/reach-neon-customer-config";
const SCOPE="primary-owner";
export type SavedNeonRecord=Readonly<{database:string;role:string;hostname:string;verifiedAt:string;updatedAt:string}>;
type DbRow={sealed_credential:string;database_name:string;role_name:string;hostname:string;verified_at:string;updated_at:string};
function vaultDb(){
 if(!vaultEncryptionReady()||!process.env.REACH_VAULT_DATABASE_URL)throw Error("Neon vault is not configured");
 const u=new URL(process.env.REACH_VAULT_DATABASE_URL);
 if(!["postgres:","postgresql:"].includes(u.protocol)||!u.hostname.endsWith(".neon.tech")||
   decodeURIComponent(u.pathname.slice(1))!=="reach_platform"||
   !u.username||u.username!=="reach_vault_app"||!u.password||
   !["require","verify-full"].includes(u.searchParams.get("sslmode")||""))
   throw Error("Neon vault target or runtime role is not approved");
 return neon(process.env.REACH_VAULT_DATABASE_URL,{fetchOptions:{signal:AbortSignal.timeout(8000)}});
}
export function neonVaultConfigured():boolean{
 try{vaultDb();return true;}catch{return false;}
}
export async function savedNeon():Promise<(SavedNeonRecord&{credential:string})|null>{
 const sql=vaultDb();
 const rows=await sql.query("SELECT sealed_credential,database_name,role_name,hostname,verified_at,updated_at FROM reach_vault.owner_neon_connections WHERE owner_key=$1 LIMIT 1",[SCOPE]) as DbRow[];
 const row=rows[0];if(!row)return null;
 const credential=unsealNeonVaultCredential(row.sealed_credential);
 const parsed=validateCustomerNeonUrl(credential);
 if(parsed.databaseName!==row.database_name||parsed.hostname!==row.hostname)
  throw Error("Saved Neon credential does not match stored metadata");
 return{database:row.database_name,role:row.role_name,hostname:row.hostname,
  verifiedAt:new Date(row.verified_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),credential};
}
export async function saveNeon(credential:string,db:string,role:string):Promise<SavedNeonRecord>{
 const parsed=validateCustomerNeonUrl(credential);
 if(parsed.databaseName!==db||!role||role.length>128)throw Error("Neon identity mismatch");
 const sealed=sealNeonVaultCredential(credential);
 const sql=vaultDb();
 const rows=await sql.query(
 "INSERT INTO reach_vault.owner_neon_connections(owner_key,sealed_credential,database_name,role_name,hostname,verified_at,updated_at) "+
 "VALUES($1,$2,$3,$4,$5,now(),now()) ON CONFLICT(owner_key) DO UPDATE SET "+
 "sealed_credential=EXCLUDED.sealed_credential,database_name=EXCLUDED.database_name,"+
 "role_name=EXCLUDED.role_name,hostname=EXCLUDED.hostname,verified_at=now(),updated_at=now() "+
 "RETURNING database_name,role_name,hostname,verified_at,updated_at",
 [SCOPE,sealed,db,role,parsed.hostname]) as DbRow[];
 const row=rows[0];if(!row)throw Error("No saved Neon record returned");
 return{database:row.database_name,role:row.role_name,hostname:row.hostname,
  verifiedAt:new Date(row.verified_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()};
}
export async function deleteSavedNeon():Promise<boolean>{
 const sql=vaultDb();
 const result=await sql.query("DELETE FROM reach_vault.owner_neon_connections WHERE owner_key=$1 RETURNING owner_key",[SCOPE]);
 return Array.isArray(result)&&result.length===1;
}
