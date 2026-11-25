/** REACH Connections 3.0: conservative snapshot status, not a live provider guarantee.
 * No secrets, token refresh, external API calls, or autonomous actions.
 */
export type ConnectionHealthStatus="verified_recently"|"verification_due"|"expires_soon"|"expired"|"expiry_unknown";
export type HealthInput={lastVerifiedAt:string|null;expiresAt:string|null};
const DAY=24*60*60*1000;
function timestamp(v:string|null):number|null{
 if(!v)return null;
 const n=Date.parse(v);
 return Number.isFinite(n)?n:null;
}
export function assessConnectionHealth(input:HealthInput,now:number=Date.now()):ConnectionHealthStatus{
 const exp=timestamp(input.expiresAt),verified=timestamp(input.lastVerifiedAt);
 if(!Number.isFinite(now))return "verification_due";
 if(input.expiresAt&&exp===null)return "expiry_unknown";
 if(exp!==null&&exp<=now)return "expired";
 if(exp!==null&&exp-now<=7*DAY)return "expires_soon";
 // A provider can report a successful verification without a token-expiry date.
 // Recently verified access may display green, but this is only a saved snapshot,
 // never a claim that the provider is online right now.
 if(exp===null){
  if(verified===null||verified>now+60_000||now-verified>7*DAY)return "expiry_unknown";
  return "verified_recently";
 }
 if(verified===null||verified>now+60_000||now-verified>7*DAY)return "verification_due";
 return "verified_recently";
}
export function healthLabel(status:ConnectionHealthStatus):string{
 const labels:Record<ConnectionHealthStatus,string>={
  verified_recently:"Verified recently",verification_due:"Verification due",
  expires_soon:"Expires soon",expired:"Expired",expiry_unknown:"Expiry unconfirmed"
 };
 return labels[status];
}
export function healthSummary<T extends {status:ConnectionHealthStatus}>(connections:readonly T[]){
 return {
  total:connections.length,
  verifiedRecently:connections.filter(c=>c.status==="verified_recently").length,
  needsAttention:connections.filter(c=>c.status!=="verified_recently").length
 };
}
