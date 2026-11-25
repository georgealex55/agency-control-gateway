import {neon} from "@neondatabase/serverless";
import type {CustomerIdentity} from "@/lib/reach-customer-auth";

export const CUSTOMER_ROLES=["client_owner","client_editor","instructor","viewer"] as const;
export type CustomerRole=typeof CUSTOMER_ROLES[number];
export type CustomerPermission="workspace:read"|"connections:read"|"content:edit"|"members:manage"|"external:execute";
export type CustomerWorkspace={id:string;name:string;slug:string;role:CustomerRole};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function isCustomerRole(value:unknown):value is CustomerRole{
 return typeof value==="string"&&CUSTOMER_ROLES.some(x=>x===value);
}
export function customerCan(role:CustomerRole,permission:CustomerPermission):boolean{
 if(permission==="external:execute")return false;
 if(permission==="workspace:read"||permission==="connections:read")return CUSTOMER_ROLES.includes(role);
 if(permission==="content:edit")return role==="client_owner"||role==="client_editor"||role==="instructor";
 if(permission==="members:manage")return role==="client_owner";
 return false;
}
export function customerDatabaseConfigured(env:Record<string,string|undefined>=process.env):boolean{
 if(env.REACH_CUSTOMER_AUTH_ENABLED!=="true")return false;
 try{
  const u=new URL(env.REACH_CUSTOMER_DATABASE_URL||"");
  return (u.protocol==="postgresql:"||u.protocol==="postgres:")&&
   u.hostname.endsWith(".neon.tech")&&u.username==="reach_customer_runtime"&&
   decodeURIComponent(u.pathname)==="/reach_platform"&&
   Boolean(u.password)&&u.port===""&&u.hash===""&&
   (u.searchParams.get("sslmode")==="verify-full"||u.searchParams.get("sslmode")==="require")&&
   [...u.searchParams.keys()].every(k=>k==="sslmode"||k==="channel_binding")&&
   !u.searchParams.has("options");
 }catch{return false;}
}
type Row={id:unknown;name:unknown;slug:unknown;role:unknown};
function mappedRows(v:unknown):Row[]{
 if(Array.isArray(v))return v as Row[];
 if(v&&typeof v==="object"&&"rows" in v&&Array.isArray(v.rows))return v.rows as Row[];
 throw Error("Invalid membership query");
}
const subjectFor=(identity:CustomerIdentity)=>"neon_auth:"+identity.subject;
function validatedWorkspace(row:Row):CustomerWorkspace|null{
 if(typeof row.id!=="string"||!uuid.test(row.id)||typeof row.name!=="string"||row.name.length>120||
 typeof row.slug!=="string"||row.slug.length>64||!isCustomerRole(row.role))return null;
 return {id:row.id,name:row.name,slug:row.slug,role:row.role};
}
export function workspaceIsValid(value:unknown):value is string{
 return typeof value==="string"&&uuid.test(value);
}
/** This role has SELECT only on reach_customer.verified_memberships, a
 * security-definer view that joins Neon Auth VERIFIED users to memberships.
 * It has no access to public customer data, Meta tokens or Neon Auth secrets.
 * No client-controlled workspace id can grant membership.
 */
export async function listCustomerWorkspaces(identity:CustomerIdentity):Promise<CustomerWorkspace[]>{
 if(!customerDatabaseConfigured())throw Error("Customer membership storage not configured");
 const sql=neon(process.env.REACH_CUSTOMER_DATABASE_URL!,{fetchOptions:{signal:AbortSignal.timeout(8000)}});
 const records=mappedRows(await sql.query(
  "SELECT id,name,slug,role FROM reach_customer.verified_memberships "+
  "WHERE identity_subject=$1 ORDER BY name ASC LIMIT 100",
  [subjectFor(identity)]));
 const mapped=records.map(validatedWorkspace);
 if(mapped.some(v=>!v))throw Error("Invalid membership record");
 return mapped as CustomerWorkspace[];
}
export async function requireCustomerWorkspace(identity:CustomerIdentity,workspaceId:string,permission:CustomerPermission):Promise<CustomerWorkspace|null>{
 if(!workspaceIsValid(workspaceId)||!customerDatabaseConfigured())return null;
 const sql=neon(process.env.REACH_CUSTOMER_DATABASE_URL!,{fetchOptions:{signal:AbortSignal.timeout(8000)}});
 const records=mappedRows(await sql.query(
  "SELECT id,name,slug,role FROM reach_customer.verified_memberships "+
  "WHERE identity_subject=$1 AND id=$2::uuid LIMIT 1",
  [subjectFor(identity),workspaceId]));
 const membership=records.length===1?validatedWorkspace(records[0]):null;
 return membership&&customerCan(membership.role,permission)?membership:null;
}
