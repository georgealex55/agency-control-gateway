export const AGENCY_MAX_USERS=5 as const;
export type UserRole="client_owner"|"client_editor"|"viewer";
export type UserStatus="reserved"|"active"|"disabled";
export const USER_ROLES=["client_owner","client_editor","viewer"] as const;
export function normalizeSeatEmail(input:unknown):string|null{
 if(typeof input!=="string")return null;
 const value=input.trim().toLowerCase();
 if(value.length<5||value.length>254||!(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(value)))return null;
 return value;
}
export function validUserRole(input:unknown):input is UserRole{return input==="client_owner"||input==="client_editor"||input==="viewer";}
export function validSeatLabel(input:unknown):input is string{return typeof input==="string"&&input.trim().length>=2&&input.trim().length<=120;}
export function validSeatId(input:unknown):input is string{return typeof input==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input);}
