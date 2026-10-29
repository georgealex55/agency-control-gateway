import {validId} from "./social-contract";
export const SOCIAL_DRY_TOPIC="agency-social-dry-run-v1";
export type DryRunPayload={jobId:string;workspaceId:string;postId:string};
export function validDryPayload(value:unknown):value is DryRunPayload {
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const d=value as Record<string,unknown>;
 return validId(d.jobId)&&validId(d.workspaceId)&&validId(d.postId);
}
