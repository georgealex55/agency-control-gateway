import {randomUUID} from "node:crypto";
import {readySql} from "@/lib/platform-store";
import {AGENCY_MAX_USERS,type UserRole} from "@/lib/user-seats-contract";
type DbRow=Record<string,unknown>;
function rows<T>(input:unknown):T[]{
 if(Array.isArray(input))return input as T[];
 if(input&&typeof input==="object"&&"rows" in input&&Array.isArray(input.rows))return input.rows as T[];
 throw Error("Unrecognized database response");
}
export type UserSeat={id:string;email:string|null;name:string;role:string;status:"active"|"reserved"|"disabled";isAdmin:boolean;createdAt:string};
function fromRow(v:DbRow):UserSeat{return {id:String(v.id),email:typeof v.email==="string"?v.email:null,name:String(v.display_name),role:String(v.role),status:v.status as UserSeat["status"],isAdmin:v.is_system_admin===true,createdAt:new Date(String(v.created_at)).toISOString()};}
const projection="id,email,display_name,role,status,is_system_admin,created_at";
export async function listUserSeats(){
 const db=await readySql();
 const capacity=rows<{max_users:number;occupied:number}>(await db.query("SELECT max_users,occupied FROM agency_platform_user_capacity WHERE id=1"))[0];
 if(!capacity||capacity.max_users!==AGENCY_MAX_USERS)throw Error("Five-seat capacity is not initialized");
 const list=rows<DbRow>(await db.query("SELECT "+projection+" FROM agency_platform_users ORDER BY is_system_admin DESC,created_at ASC LIMIT 25"));
 return {maxUsers:AGENCY_MAX_USERS,used:Number(capacity.occupied),remaining:Math.max(0,AGENCY_MAX_USERS-Number(capacity.occupied)),users:list.map(fromRow),individualLoginEnabled:false,invitationDeliveryEnabled:false};
}
export async function reserveUserSeat(input:{email:string;name:string;role:UserRole}):Promise<UserSeat>{
 const db=await readySql();
 const result=rows<DbRow>(await db.query(
 "WITH created AS (INSERT INTO agency_platform_users(id,email,display_name,role,status,is_system_admin) VALUES($1::uuid,$2,$3,$4,'reserved',false) RETURNING "+projection+"),audit AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) SELECT NULL,'users.seat.reserved',jsonb_build_object('user_id',id,'role',role) FROM created RETURNING id) SELECT * FROM created",
 [randomUUID(),input.email,input.name,input.role]));
 if(!result[0])throw Error("User seat could not be reserved");
 return fromRow(result[0]);
}
export async function changeReservedSeat(id:string,disabled:boolean):Promise<UserSeat|null>{
 const db=await readySql();
 const newStatus=disabled?"disabled":"reserved";
 const result=rows<DbRow>(await db.query(
 "WITH changed AS (UPDATE agency_platform_users SET status=$2,updated_at=now() WHERE id=$1::uuid AND is_system_admin=false AND status IN('reserved','disabled') AND status<>$2 RETURNING "+projection+"),audit AS (INSERT INTO agency_platform_audit_events(workspace_id,action,detail) SELECT NULL,'users.seat.'||status,jsonb_build_object('user_id',id) FROM changed RETURNING id) SELECT * FROM changed",
 [id,newStatus]));
 return result[0]?fromRow(result[0]):null;
}
export function classifySeatError(err:unknown):{code:number;error:string}{
 const code=err&&typeof err==="object"&&"code" in err?String(err.code):"";
 if(code==="23514")return {code:409,error:"Five-user capacity reached. Disable an unused reservation before adding another."};
 if(code==="23505")return {code:409,error:"This email already has a reserved or disabled seat."};
 return {code:503,error:"Unable to update agency user seats."};
}
