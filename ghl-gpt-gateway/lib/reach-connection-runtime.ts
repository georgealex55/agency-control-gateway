import {productionDatabaseApproved} from "@/lib/reach-connection-approval";
import {stageEnabled} from "@/lib/social-contract";
import {commandApprovedStorageConfigured} from "@/lib/reach-command-layout-store";

/**
 * Connection APIs are isolated from Social Studio's publishing and internal
 * scheduling API gates. Production requires explicit owner-approved storage,
 * configured account login and a separately enabled read-only consent flow.
 */
export function productionConnectionApproved(env:NodeJS.ProcessEnv=process.env):boolean{
 return productionDatabaseApproved(env);
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
