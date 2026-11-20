import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import {validateCustomerNeonUrl} from "@/lib/reach-neon-customer-config";

/**
 * Temporary owner-browser session link for Neon. This is NOT a persistent
 * customer credential vault and must not be used by workspace data handlers.
 * All database operations through this feature are read-only.
 */
export const LIVE_NEON_COOKIE="reach_neon_live";
export const LIVE_NEON_MAX_AGE=4*60*60;
export const LIVE_NEON_PATH="/api/reach/connections/neon";
export type LiveNeonCredential=Readonly<{connectionString:string;database:string;role:string;host:string;expiresAt:number;verifiedAt:number}>;
type Envelope={v:number;dsn:string;db:string;role:string;host:string;exp:number;checked:number;bind:string};
const b64=(x:Buffer)=>x.toString("base64url");
function deriveKey(secret:string):Buffer{
 if(typeof secret!=="string"||secret.length<32)throw Error("Owner connection session key not configured");
 return createHmac("sha256",secret).update("reach-neon-owner-session-encryption-v1").digest();
}
function ownerBinding(sessionToken:string):Buffer{
 return createHash("sha256").update("reach-neon-owner-binding-v1:").update(sessionToken).digest();
}
export function sealLiveNeonCredential(input:Omit<LiveNeonCredential,"expiresAt"|"verifiedAt">,ownerToken:string,secret:string,now=Date.now()):string{
 if(!ownerToken||ownerToken.length>512)throw Error("Owner login required");
 const checked=validateCustomerNeonUrl(input.connectionString);
 if(checked.databaseName!==input.database||checked.hostname!==input.host||!input.role||input.role.length>128)
  throw Error("Invalid verified database details");
 const envelope:Envelope={v:1,dsn:checked.connectionString,db:input.database,role:input.role,host:input.host,
  exp:now+LIVE_NEON_MAX_AGE*1000,checked:now,bind:b64(ownerBinding(ownerToken))};
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",deriveKey(secret),iv);
 cipher.setAAD(Buffer.from("reach-neon-live-v1"));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(envelope),"utf8"),cipher.final()]);
 const sealed="v1."+b64(iv)+"."+b64(encrypted)+"."+b64(cipher.getAuthTag());
 if(sealed.length>3700)throw Error("Connection string too long for a temporary secure session");
 return sealed;
}
export function openLiveNeonCredential(value:string|undefined,ownerToken:string|undefined,secret:string,now=Date.now()):LiveNeonCredential|null{
 if(!value||!ownerToken||value.length>3800||ownerToken.length>512)return null;
 const parts=value.split(".");
 if(parts.length!==4||parts[0]!=="v1"||!/^[A-Za-z0-9_-]{16}$/.test(parts[1])||
    !/^[A-Za-z0-9_-]{22}$/.test(parts[3])||!/^[A-Za-z0-9_-]+$/.test(parts[2]))return null;
 try{
  const iv=Buffer.from(parts[1],"base64url"),ciphertext=Buffer.from(parts[2],"base64url"),tag=Buffer.from(parts[3],"base64url");
  if(iv.length!==12||tag.length!==16||ciphertext.length>2800)return null;
  const decipher=createDecipheriv("aes-256-gcm",deriveKey(secret),iv);
  decipher.setAAD(Buffer.from("reach-neon-live-v1"));
  decipher.setAuthTag(tag);
  const payload=JSON.parse(Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString("utf8")) as Envelope;
  if(payload.v!==1||!Number.isSafeInteger(payload.exp)||!Number.isSafeInteger(payload.checked)||
     payload.exp<=now||payload.checked>now||payload.exp-payload.checked>LIVE_NEON_MAX_AGE*1000||
     !payload.bind||typeof payload.bind!=="string")return null;
  const stored=Buffer.from(payload.bind,"base64url"),actual=ownerBinding(ownerToken);
  if(stored.length!==actual.length||!timingSafeEqual(stored,actual))return null;
  const checked=validateCustomerNeonUrl(payload.dsn);
  if(checked.databaseName!==payload.db||checked.hostname!==payload.host||typeof payload.role!=="string"||
     payload.role.length>128)return null;
  return{connectionString:checked.connectionString,database:payload.db,host:payload.host,role:payload.role,
   expiresAt:payload.exp,verifiedAt:payload.checked};
 }catch{return null;}
}
