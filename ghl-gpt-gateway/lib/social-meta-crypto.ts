import {createCipheriv,createDecipheriv,randomBytes,createHmac,timingSafeEqual} from "node:crypto";
import type {MetaProvider} from "./social-meta-contract";
/** Server-only envelope encryption for future per-workspace Meta access tokens. No OAuth activation here. */
export function parseMetaKey(value:string|undefined):Buffer{
 if(!value||!/^[A-Za-z0-9_-]{43}$/.test(value))throw Error("Meta token key is not configured as a 32-byte base64url value");
 const b=Buffer.from(value,"base64url");
 if(b.byteLength!==32)throw Error("Meta token key must be 32 bytes");
 return b;
}
function bind(workspaceId:string,provider:MetaProvider,accountId:string):Buffer{
 if(!/^[a-f0-9-]{36}$/i.test(workspaceId)||!/^[0-9]{2,40}$/.test(accountId))throw Error("Invalid token owner");
 return Buffer.from("meta:"+workspaceId+":"+provider+":"+accountId,"utf8");
}
export function encryptMetaToken(token:string,keyString:string,workspaceId:string,provider:MetaProvider,accountId:string):string{
 if(token.length<10||token.length>4096)throw Error("Invalid Meta token length");
 const key=parseMetaKey(keyString),iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);
 cipher.setAAD(bind(workspaceId,provider,accountId));
 const payload=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
 return "v1."+iv.toString("base64url")+"."+cipher.getAuthTag().toString("base64url")+"."+payload.toString("base64url");
}
export function decryptMetaToken(envelope:string,keyString:string,workspaceId:string,provider:MetaProvider,accountId:string):string{
 const parts=envelope.split(".");
 if(parts.length!==4||parts[0]!=="v1")throw Error("Invalid token envelope");
 const iv=Buffer.from(parts[1],"base64url"),tag=Buffer.from(parts[2],"base64url"),payload=Buffer.from(parts[3],"base64url");
 if(iv.byteLength!==12||tag.byteLength!==16||payload.byteLength<1||payload.byteLength>4096)throw Error("Invalid Meta token envelope");
 const decipher=createDecipheriv("aes-256-gcm",parseMetaKey(keyString),iv);
 decipher.setAAD(bind(workspaceId,provider,accountId));decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(payload),decipher.final()]).toString("utf8");
}
export function signMetaConsent(input:{workspaceId:string;provider:MetaProvider;expires:number;nonce:string},secret:string):string{
 if(secret.length<32||!/^[A-Za-z0-9_-]{32,128}$/.test(input.nonce)||input.expires<=0)throw Error("Invalid consent state");
 const data=Buffer.from(JSON.stringify(input)).toString("base64url");
 const signature=createHmac("sha256",secret).update(data).digest("base64url");
 return data+"."+signature;
}
export function verifyMetaConsent(value:string,secret:string,now:number):{workspaceId:string;provider:MetaProvider;expires:number;nonce:string}|null{
 if(!value||value.length>800||secret.length<32)return null;
 const parts=value.split(".");if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]{43}$/.test(parts[1]))return null;
 const expected=createHmac("sha256",secret).update(parts[0]).digest("base64url");
 const a=Buffer.from(expected),b=Buffer.from(parts[1]);
 if(a.length!==b.length||!timingSafeEqual(a,b))return null;
 try{
  const parsed=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8")) as Record<string,unknown>;
  if(typeof parsed.workspaceId!=="string"||!/^[a-f0-9-]{36}$/i.test(parsed.workspaceId)||!(parsed.provider==="facebook_pages"||parsed.provider==="instagram_professional")||typeof parsed.expires!=="number"||!Number.isSafeInteger(parsed.expires)||parsed.expires<=now||parsed.expires>now+10*60*1000||typeof parsed.nonce!=="string"||!/^[A-Za-z0-9_-]{32,128}$/.test(parsed.nonce))return null;
  return {workspaceId:parsed.workspaceId,provider:parsed.provider,expires:parsed.expires,nonce:parsed.nonce};
 }catch{return null;}
}
