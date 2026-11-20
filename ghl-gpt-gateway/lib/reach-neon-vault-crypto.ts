import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {validateCustomerNeonUrl} from "@/lib/reach-neon-customer-config";
const AAD=Buffer.from("reach-vault:primary-owner:neon:v1","utf8");
export function vaultEncryptionReady(env:NodeJS.ProcessEnv=process.env):boolean{
 const k=env.REACH_VAULT_ENCRYPTION_KEY||"";
 return /^[A-Za-z0-9_-]{43}$/.test(k)&&Buffer.from(k,"base64url").length===32;
}
function key(env:NodeJS.ProcessEnv):Buffer{
 if(!vaultEncryptionReady(env))throw Error("Vault encryption key not configured");
 return Buffer.from(env.REACH_VAULT_ENCRYPTION_KEY!,"base64url");
}
export function sealNeonVaultCredential(dsn:string,env:NodeJS.ProcessEnv=process.env):string{
 const input=validateCustomerNeonUrl(dsn);
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(env),iv);
 cipher.setAAD(AAD);
 const ciphertext=Buffer.concat([cipher.update(input.connectionString,"utf8"),cipher.final()]);
 return "v1."+iv.toString("base64url")+"."+ciphertext.toString("base64url")+"."+cipher.getAuthTag().toString("base64url");
}
export function unsealNeonVaultCredential(envelope:string,env:NodeJS.ProcessEnv=process.env):string{
 const parts=envelope.split(".");
 if(parts.length!==4||parts[0]!=="v1"||parts.some((s,i)=>i>0&&!/^[A-Za-z0-9_-]+$/.test(s)))
  throw Error("Invalid encrypted credential");
 const iv=Buffer.from(parts[1],"base64url"),ct=Buffer.from(parts[2],"base64url"),tag=Buffer.from(parts[3],"base64url");
 if(iv.length!==12||tag.length!==16||ct.length>4096)throw Error("Invalid encrypted credential");
 const decipher=createDecipheriv("aes-256-gcm",key(env),iv);
 decipher.setAAD(AAD);decipher.setAuthTag(tag);
 const plaintext=Buffer.concat([decipher.update(ct),decipher.final()]).toString("utf8");
 return validateCustomerNeonUrl(plaintext).connectionString;
}
