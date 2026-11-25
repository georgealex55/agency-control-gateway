import {createHash,randomBytes} from "node:crypto";
import {neon} from "@neondatabase/serverless";
import {isCustomerRole,workspaceIsValid,type CustomerRole} from "@/lib/reach-customer-access";
import type {CustomerIdentity} from "@/lib/reach-customer-auth";
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const EMAIL=/^[A-Za-z0-9_.+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
function validatedInviteUrl(env:Record<string,string|undefined>=process.env):string|null{
 if(env.REACH_CUSTOMER_AUTH_ENABLED!=="true")return null;
 try{
  const u=new URL(env.REACH_CUSTOMER_INVITES_DATABASE_URL||"");
  if(!["postgres:","postgresql:"].includes(u.protocol)||!u.hostname.endsWith(".neon.tech")||
   u.username!=="reach_invite_runtime"||!u.password||u.port||u.hash||
   decodeURIComponent(u.pathname)!=="/reach_platform"||
   !["require","verify-full"].includes(u.searchParams.get("sslmode")||"")||
   [...u.searchParams.keys()].some(k=>!["sslmode","channel_binding"].includes(k)))return null;
  return u.href;
 }catch{return null;}
}
export function invitesAvailable(env:Record<string,string|undefined>=process.env):boolean{return validatedInviteUrl(env)!==null;}
const hash=(token:string)=>createHash("sha256").update(token,"utf8").digest("hex");
const resultRows=(data:unknown):Record<string,unknown>[]=>{
 if(Array.isArray(data))return data as Record<string,unknown>[];
 if(data&&typeof data==="object"&&"rows" in data&&Array.isArray(data.rows))return data.rows as Record<string,unknown>[];
 throw Error("Invitation storage unavailable");
};
function db(){
 const url=validatedInviteUrl();
 if(!url)throw Error("Invitation database not configured");
 return neon(url,{fetchOptions:{signal:AbortSignal.timeout(8000)}});
}
export async function issueCustomerInvitation(input:{workspaceId:string;email:string;role:CustomerRole}):Promise<string>{
 const email=input.email.trim().toLowerCase();
 if(!workspaceIsValid(input.workspaceId)||!EMAIL.test(email)||email.length>254||!isCustomerRole(input.role))throw Error("Invalid invitation request");
 const token=randomBytes(32).toString("base64url");
 const r=resultRows(await db().query(
  "SELECT reach_customer_invites.issue($1,$2::uuid,$3,$4) AS issued",
  [hash(token),input.workspaceId,email,input.role]));
 if(r[0]?.issued!==true)throw Error("Workspace invitation was not created");
 return token; // Raw token is shown only once to the authenticated owner, never stored.
}
export async function listInvitableWorkspaces():Promise<{id:string;name:string}[]>{
 const r=resultRows(await db().query("SELECT id,name FROM reach_customer_invites.available_workspaces()"));
 return r.map(v=>{
  if(!workspaceIsValid(v.id)||typeof v.name!=="string"||v.name.length<1||v.name.length>120)throw Error("Invalid workspace registry");
  return {id:v.id,name:v.name};
 });
}
export async function acceptCustomerInvitation(identity:CustomerIdentity,token:string):Promise<boolean>{
 if(typeof token!=="string"||!TOKEN.test(token))return false;
 const subject="neon_auth:"+identity.subject;
 const r=resultRows(await db().query(
  "SELECT reach_customer_invites.accept($1,$2) AS accepted",
  [hash(token),subject]));
 return r[0]?.accepted===true;
}
