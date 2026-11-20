import {NextRequest,NextResponse} from "next/server";
import {neon} from "@neondatabase/serverless";
import {adminAuthenticated,cookieName,sameOrigin} from "@/lib/portal-auth";
import {validateCustomerNeonUrl} from "@/lib/reach-neon-customer-config";
import {LIVE_NEON_COOKIE,LIVE_NEON_MAX_AGE,LIVE_NEON_PATH,openLiveNeonCredential,sealLiveNeonCredential} from "@/lib/reach-neon-live-session";
export const runtime="nodejs";export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
const ownerToken=(req:NextRequest)=>req.cookies.get(cookieName())?.value;
const secret=()=>process.env.AGENCY_PORTAL_SESSION_SECRET||"";
async function readOnlyProbe(uri:string){
 const sql=neon(uri,{fetchOptions:{signal:AbortSignal.timeout(8000)}});
 const result=await sql.query("SELECT current_database()::text AS database_name, current_user::text AS role_name");
 const row=Array.isArray(result)?result[0] as Record<string,unknown>|undefined:undefined;
 if(!row||typeof row.database_name!=="string"||typeof row.role_name!=="string")
  throw Error("Neon identity verification failed");
 return{database:row.database_name,role:row.role_name};
}
const status=(c:{database:string;role:string;host:string;expiresAt:number;verifiedAt:number})=>({
 connected:true,scope:"owner_session" as const,persisted:false,storageActivated:false,readOnly:true,
 database:c.database,role:c.role,hostname:c.host,expiresAt:new Date(c.expiresAt).toISOString(),
 verifiedAt:new Date(c.verifiedAt).toISOString()
});
/** Reports live session status; checks connectivity anew without modifying data. */
export async function GET(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Owner sign-in required."},401);
 const c=openLiveNeonCredential(req.cookies.get(LIVE_NEON_COOKIE)?.value,ownerToken(req),secret());
 if(!c)return reply({connected:false,scope:"owner_session",persisted:false,storageActivated:false,readOnly:true});
 try{
  const confirmed=await readOnlyProbe(c.connectionString);
  if(confirmed.database!==c.database||confirmed.role!==c.role)throw Error("Identity mismatch");
  return reply(status(c));
 }catch{return reply({connected:false,unreachable:true,scope:"owner_session",persisted:false,storageActivated:false,readOnly:true});}
}
/** Verifies Neon and creates an AES-GCM encrypted session cookie; never stores a long-term secret. */
export async function POST(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Owner sign-in required."},401);
 if(!sameOrigin(req))return reply({error:"Invalid request origin."},403);
 if(Number(req.headers.get("content-length")||0)>2200)return reply({error:"Connection details are too long."},413);
 let raw:string;try{raw=await req.text();}catch{return reply({error:"Invalid request."},400);}
 if(raw.length>2200)return reply({error:"Connection details are too long."},413);
 let data:unknown;try{data=JSON.parse(raw);}catch{return reply({error:"Invalid request."},400);}
 if(!data||typeof data!=="object"||Array.isArray(data)||Object.keys(data).length!==1||!("connectionString" in data))
  return reply({error:"Only a Neon connection string is accepted."},400);
 let conn:ReturnType<typeof validateCustomerNeonUrl>;
 try{conn=validateCustomerNeonUrl((data as {connectionString:unknown}).connectionString);}
 catch(e){return reply({error:e instanceof Error?e.message:"Invalid connection string."},422);}
 if(conn.connectionString.length>1700)return reply({error:"The connection string exceeds the short-lived session limit."},413);
 let details:{database:string;role:string};
 try{
  details=await readOnlyProbe(conn.connectionString);
  if(details.database!==conn.databaseName)throw Error("Unexpected database");
 }catch{return reply({error:"Neon could not verify this database and role. No session was connected."},422);}
 try{
  const token=sealLiveNeonCredential({connectionString:conn.connectionString,database:details.database,
   role:details.role,host:conn.hostname},ownerToken(req)||"",secret());
  const c=openLiveNeonCredential(token,ownerToken(req),secret());
  if(!c)throw Error("Unable to establish encrypted owner session");
  const response=reply(status(c));
  response.cookies.set(LIVE_NEON_COOKIE,token,{
   httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:LIVE_NEON_PATH,
   maxAge:LIVE_NEON_MAX_AGE
  });
  return response;
 }catch{return reply({error:"Secure Neon session could not be established. Your credentials were not stored."},422);}
}
/** Revokes the temporary browser-owned Neon connection. */
export async function DELETE(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Owner sign-in required."},401);
 if(!sameOrigin(req))return reply({error:"Invalid request origin."},403);
 const response=reply({connected:false,scope:"owner_session",persisted:false,storageActivated:false});
 response.cookies.set(LIVE_NEON_COOKIE,"",{
  httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:LIVE_NEON_PATH,maxAge:0
 });
 return response;
}
