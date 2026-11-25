import {createHmac,createPublicKey,randomBytes,timingSafeEqual,verify,type JsonWebKey} from "node:crypto";
import type {NextRequest} from "next/server";

const COOKIE="reach_customer_session";
const TTL_SECONDS=15*60;
const MAX_ASSERTION=8192;
export type CustomerIdentity={subject:string};
export type CustomerAuthConfig={issuer:string;audience:string;jwksUrl:string;sessionSecret:string};
export function customerAuthConfig(env:Record<string,string|undefined>=process.env):CustomerAuthConfig|null{
 if(env.REACH_CUSTOMER_AUTH_ENABLED!=="true")return null;
 const issuer=env.REACH_CUSTOMER_AUTH_ISSUER||"";
 const audience=env.REACH_CUSTOMER_AUTH_AUDIENCE||"";
 const jwksUrl=env.REACH_CUSTOMER_AUTH_JWKS_URL||"";
 const sessionSecret=env.REACH_CUSTOMER_SESSION_SECRET||"";
 try{
  const iss=new URL(issuer),jwks=new URL(jwksUrl);
  if(iss.protocol!=="https:"||jwks.protocol!=="https:"||iss.username||iss.password||iss.search||iss.hash||
   iss.pathname!=="/"||jwks.username||jwks.password||jwks.hash||jwks.search||
   !iss.hostname.endsWith(".neon.tech")||!jwks.hostname.endsWith(".neon.tech")||iss.origin!==jwks.origin||
   audience.length<1||audience.length>200||!/^[-A-Za-z0-9_:.\/]+$/.test(audience)||
   sessionSecret.length<32||sessionSecret.length>1024)return null;
  return {issuer:iss.origin,audience,jwksUrl:jwks.href,sessionSecret};
 }catch{return null;}
}
function decodePart(part:string):unknown{
 if(!/^[A-Za-z0-9_-]{2,4096}$/.test(part))throw Error("Invalid assertion");
 return JSON.parse(Buffer.from(part,"base64url").toString("utf8")) as unknown;
}
const isObj=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==="object"&&!Array.isArray(v);
const isSubject=(s:unknown):s is string=>typeof s==="string"&&/^[A-Za-z0-9:_-]{6,200}$/.test(s);
export async function verifyCustomerAssertion(assertion:string,config:CustomerAuthConfig,fetcher:typeof fetch=fetch,now=Math.floor(Date.now()/1000)):Promise<CustomerIdentity>{
 if(typeof assertion!=="string"||assertion.length<70||assertion.length>MAX_ASSERTION)throw Error("Invalid customer assertion");
 const parts=assertion.split(".");
 if(parts.length!==3||parts.some(p=>!/^[A-Za-z0-9_-]+$/.test(p)))throw Error("Malformed assertion");
 const header=decodePart(parts[0]),payload=decodePart(parts[1]);
 if(!isObj(header)||header.alg!=="EdDSA"||typeof header.kid!=="string"||
  !/^[A-Za-z0-9:_-]{1,128}$/.test(header.kid)||header.crit!==undefined||header.jku!==undefined||
  header.jwk!==undefined||header.x5u!==undefined||header.x5c!==undefined||
  !isObj(payload)||payload.iss!==config.issuer||!isSubject(payload.sub)||
  !(payload.aud===config.audience||(Array.isArray(payload.aud)&&payload.aud.includes(config.audience)))||
  typeof payload.exp!=="number"||!Number.isSafeInteger(payload.exp)||
  payload.exp<=now||payload.exp>now+20*60||
  (payload.nbf!==undefined&&(typeof payload.nbf!=="number"||payload.nbf>now+30))||
  (payload.iat!==undefined&&(typeof payload.iat!=="number"||payload.iat>now+30))||
  payload.emailVerified!==true)throw Error("Untrusted customer assertion");
 const source=new URL(config.jwksUrl);
 if(source.protocol!=="https:"||!source.hostname.endsWith(".neon.tech"))throw Error("Untrusted JWKS source");
 const response=await fetcher(config.jwksUrl,{method:"GET",redirect:"error",cache:"no-store",
  headers:{Accept:"application/json"},signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error("Unable to validate customer identity");
 const raw:unknown=await response.json();
 if(!isObj(raw)||!Array.isArray(raw.keys)||raw.keys.length>16)throw Error("Invalid signing key set");
 const matches=raw.keys.filter(k=>isObj(k)&&k.kid===header.kid&&k.kty==="OKP"&&k.crv==="Ed25519"&&
  (k.alg===undefined||k.alg==="EdDSA")&&(k.use===undefined||k.use==="sig")&&
  typeof k.x==="string"&&/^[A-Za-z0-9_-]{43}$/.test(k.x));
 if(matches.length!==1)throw Error("Untrusted signing key");
 const k=matches[0] as Record<string,unknown>;
 const pub=createPublicKey({key:{kty:"OKP",crv:"Ed25519",x:String(k.x)} as JsonWebKey,format:"jwk"});
 if(!verify(null,Buffer.from(parts[0]+"."+parts[1],"utf8"),pub,Buffer.from(parts[2],"base64url")))
  throw Error("Invalid assertion signature");
 return {subject:payload.sub};
}
function mac(body:string,secret:string):string{return createHmac("sha256",secret).update("reach-customer:v1:"+body).digest("base64url");}
export function createCustomerSession(identity:CustomerIdentity,secret:string,now=Math.floor(Date.now()/1000)):string{
 if(!isSubject(identity.subject)||secret.length<32)throw Error("Customer session unavailable");
 const payload="v1."+Buffer.from(identity.subject,"utf8").toString("base64url")+"."+now+"."+(now+TTL_SECONDS)+"."+randomBytes(16).toString("base64url");
 return payload+"."+mac(payload,secret);
}
export function verifyCustomerSession(cookie:string|undefined,secret:string,now=Math.floor(Date.now()/1000)):CustomerIdentity|null{
 if(!cookie||cookie.length>1024||secret.length<32)return null;
 const parts=cookie.split(".");
 if(parts.length!==6||parts[0]!=="v1")return null;
 const iat=Number(parts[2]),exp=Number(parts[3]);
 if(!Number.isSafeInteger(iat)||!Number.isSafeInteger(exp)||iat>now+30||
  exp<=now||exp-iat!==TTL_SECONDS||!/^[A-Za-z0-9_-]{22}$/.test(parts[4])||
  !/^[A-Za-z0-9_-]{43}$/.test(parts[5]))return null;
 const subject=Buffer.from(parts[1],"base64url").toString("utf8");
 if(!isSubject(subject)||Buffer.from(subject,"utf8").toString("base64url")!==parts[1])return null;
 const supplied=Buffer.from(parts[5],"ascii");
 const expected=Buffer.from(mac(parts.slice(0,5).join("."),secret),"ascii");
 if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return null;
 return {subject};
}
export function customerIdentityFromRequest(req:NextRequest):CustomerIdentity|null{
 const config=customerAuthConfig();
 return config?verifyCustomerSession(req.cookies.get(COOKIE)?.value,config.sessionSecret):null;
}
export const customerCookieName=()=>COOKIE;
export const customerCookieLifetime=()=>TTL_SECONDS;
