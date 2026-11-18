import {createHash,timingSafeEqual} from "node:crypto";
import {stageEnabled} from "@/lib/social-contract";
import {commandApprovedStorageConfigured} from "@/lib/reach-command-layout-store";

/**
 * Connection APIs are isolated from Social Studio's publishing and internal
 * scheduling API gates. Production requires explicit owner-approved storage,
 * configured account login and a separately enabled read-only consent flow.
 */
export function productionConnectionApproved(env:NodeJS.ProcessEnv=process.env):boolean{
 if(env.VERCEL_ENV!=="production"||env.REACH_CONNECTIONS_PRODUCTION_ENABLED!=="true")return false;
 const database=env.AGENCY_PLATFORM_DATABASE_URL?.trim()||"";
 const fingerprint=env.REACH_CONNECTIONS_APPROVED_DATABASE_SHA256?.trim().toLowerCase()||"";
 if(!database||!/^[0-9a-f]{64}$/.test(fingerprint))return false;
 const actual=createHash("sha256").update(database,"utf8").digest();
 return timingSafeEqual(actual,Buffer.from(fingerprint,"hex"));
}
export function connectionRuntimeEnabled(env:NodeJS.ProcessEnv=process.env):boolean{
 if(stageEnabled(env))return commandApprovedStorageConfigured();
 return productionConnectionApproved(env);
}
export function connectionRuntimeStatus(env:NodeJS.ProcessEnv=process.env):"ready"|"approval_required"|"unsupported_environment"{
 if(env.VERCEL_ENV==="production"||stageEnabled(env))
  return connectionRuntimeEnabled(env)?"ready":"approval_required";
 return "unsupported_environment";
}
