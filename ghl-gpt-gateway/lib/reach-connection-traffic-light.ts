import type {ConnectionHealthStatus} from "@/lib/reach-connection-health";

/** Status is derived exclusively from stored connections and conservative
 * verification snapshots. A missing response NEVER means "disconnected".
 */
export type ConnectionLight="green"|"yellow"|"red";
export type ConnectionDisplay={
 light:ConnectionLight;
 label:"Connected"|"Needs attention"|"Disconnected"|"Checking status";
 help:string;
};
export type ConnectionEvidence={
 inventoryReady:boolean;
 linkedCount:number;
 pendingCount:number;
 statuses:(ConnectionHealthStatus|null)[];
 explicitExpiredCount:number;
};
export function connectionTrafficLight(e:ConnectionEvidence):ConnectionDisplay{
 if(!e.inventoryReady)return {light:"yellow",label:"Checking status",help:"Account status has not been confirmed yet."};
 if(e.linkedCount===0&&e.pendingCount>0)return {
  light:"yellow",label:"Needs attention",help:"Choose your business account to finish connecting."
 };
 if(e.linkedCount===0)return {light:"red",label:"Disconnected",help:"Connect your account to start using this service."};
 if(e.explicitExpiredCount>=e.linkedCount||e.statuses.length===e.linkedCount&&
    e.statuses.every(s=>s==="expired"))return {
  light:"red",label:"Disconnected",help:"Access has expired. Reconnect your account."
 };
 if(e.statuses.length!==e.linkedCount||e.statuses.some(s=>s===null))
  return {light:"yellow",label:"Needs attention",help:"Connection status could not be confirmed. Check the account."};
 if(e.statuses.every(s=>s==="verified_recently")&&e.pendingCount===0)return {
  light:"green",label:"Connected",help:"Access was verified recently."
 };
 return {light:"yellow",label:"Needs attention",help:
   e.pendingCount>0?"Finish selecting the additional account.":
   e.statuses.some(s=>s==="expires_soon")?"Access is expiring soon. Check the account.":
   e.statuses.some(s=>s==="expiry_unknown")?"Access is saved, but its expiration is unconfirmed.":
   e.statuses.some(s=>s==="verification_due")?"It's time to verify this connection.":
   "One or more linked accounts need attention."
 };
}
