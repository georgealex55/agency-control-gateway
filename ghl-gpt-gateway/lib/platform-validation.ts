import type { ModuleKey } from "./agency-platform";
export type BusinessType = "website" | "education" | "marketing" | "general";
export const PLATFORM_MODULE_KEYS = ["website","crm","social","lms","funnels","automation","analytics"] as const;
const keys=new Set<string>(PLATFORM_MODULE_KEYS);
export function isModuleKey(v:unknown):v is ModuleKey{return typeof v==="string"&&keys.has(v);}
export function validSlug(v:unknown):v is string{return typeof v==="string"&&/^[a-z][a-z0-9-]{1,46}[a-z0-9]$/.test(v)&&!v.includes("--");}
export function validWorkspaceName(v:unknown):v is string{return typeof v==="string"&&v.trim().length>=2&&v.trim().length<=120;}
export function validBusinessType(v:unknown):v is BusinessType{return v==="website"||v==="education"||v==="marketing"||v==="general";}
export function validWorkspaceId(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
