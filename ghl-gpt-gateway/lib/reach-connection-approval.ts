import {createHash,timingSafeEqual} from "node:crypto";

/** Exact DB credential approval for a production owner-controlled connection flow.
 * No query is ever made to the database here. Compare only a SHA-256 digest and
 * never expose the credential, digest or authentication secret to clients.
 */
export type ConnectionEnvironment={
 [key:string]:string|undefined;
 VERCEL_ENV?:string;
 REACH_CONNECTIONS_PRODUCTION_ENABLED?:string;
 AGENCY_PLATFORM_DATABASE_URL?:string;
 REACH_CONNECTIONS_APPROVED_DATABASE_SHA256?:string;
};
export function productionDatabaseApproved(env:ConnectionEnvironment):boolean{
 if(env.VERCEL_ENV!=="production"||env.REACH_CONNECTIONS_PRODUCTION_ENABLED!=="true")return false;
 const database=env.AGENCY_PLATFORM_DATABASE_URL?.trim()||"";
 const fingerprint=env.REACH_CONNECTIONS_APPROVED_DATABASE_SHA256?.trim().toLowerCase()||"";
 if(!database||!/^[0-9a-f]{64}$/.test(fingerprint))return false;
 const actual=createHash("sha256").update(database,"utf8").digest();
 return timingSafeEqual(actual,Buffer.from(fingerprint,"hex"));
}
