import {NextRequest,NextResponse} from "next/server";
import {neon} from "@neondatabase/serverless";
import {adminAuthenticated,cookieName,sameOrigin} from "@/lib/portal-auth";
import {validateCustomerNeonUrl} from "@/lib/reach-neon-customer-config";
import {LIVE_NEON_COOKIE,LIVE_NEON_PATH,openLiveNeonCredential} from "@/lib/reach-neon-live-session";
import {neonVaultConfigured,savedNeon,saveNeon,deleteSavedNeon} from "@/lib/reach-neon-vault-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{
 "Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"
}});
const result=(r:{database:string;role:string;hostname:string;verifiedAt:string;updatedAt:string})=>({
 saved:true,persisted:true,storageActivated:false,readOnly:true,scope:"single_owner",
 database:r.database,role:r.role,hostname:r.hostname,verifiedAt:r.verifiedAt,updatedAt:r.updatedAt
});
async function probe(dsn:string){
 const validated=validateCustomerNeonUrl(dsn);
 const sql=neon(validated.connectionString,{fetchOptions:{signal:AbortSignal.timeout(8000)}});
 const rows=await sql.query("SELECT current_database()::text AS database_name,current_user::text AS role_name") as {database_name:string;role_name:string}[];
 if(!rows.length||rows[0].database_name!==validated.databaseName||!rows[0].role_name)
  throw Error("Neon identity verification failed");
 return {db:rows[0].database_name,role:rows[0].role_name};
}
export async function GET(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Owner sign-in required"},401);
 if(!neonVaultConfigured())return reply({configured:false,saved:false,storageActivated:false,readOnly:true});
 try{
  const row=await savedNeon();
  return row?reply({configured:true,...result(row)}):reply({configured:true,saved:false,storageActivated:false,readOnly:true});
 }catch{return reply({error:"Persistent Neon connection registry unavailable"},503);}
}
export async function POST(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Owner sign-in required"},401);
 if(!sameOrigin(req))return reply({error:"Invalid request origin"},403);
 if(!neonVaultConfigured())return reply({error:"Persistent Neon storage is not configured"},503);
 if(Number(req.headers.get("content-length")||0)>4500)return reply({error:"Invalid connection size"},413);
 let raw:string;try{raw=await req.text();}catch{return reply({error:"Invalid request"},400);}
 if(raw.length>4500)return reply({error:"Invalid connection size"},413);
 let input:unknown;try{input=JSON.parse(raw);}catch{return reply({error:"Invalid JSON"},400);}
 if(!input||typeof input!=="object"||Array.isArray(input))return reply({error:"Invalid request"},400);
 const p=input as Record<string,unknown>;
 if(Object.keys(p).length!==1)return reply({error:"Unexpected fields"},400);
 let dsn:string;
 if(p.useLiveSession===true){
  const live=openLiveNeonCredential(req.cookies.get(LIVE_NEON_COOKIE)?.value,
   req.cookies.get(cookieName())?.value,process.env.AGENCY_PORTAL_SESSION_SECRET||"");
  if(!live)return reply({error:"Active Neon session has expired; enter credentials again"},409);
  dsn=live.connectionString;
 }else if("connectionString" in p&&typeof p.connectionString==="string"){
  try{dsn=validateCustomerNeonUrl(p.connectionString).connectionString;}
  catch{return reply({error:"Invalid Neon connection string"},422);}
 }else return reply({error:"Neon credentials or an active session are required"},400);
 try{
  const verified=await probe(dsn);
  const record=await saveNeon(dsn,verified.db,verified.role);
  return reply({configured:true,...result(record)},201);
 }catch{return reply({error:"Unable to verify and securely save Neon connection"},503);}
}
export async function DELETE(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Owner sign-in required"},401);
 if(!sameOrigin(req))return reply({error:"Invalid request origin"},403);
 if(!neonVaultConfigured())return reply({error:"Persistent Neon storage is not configured"},503);
 try{
  const deleted=await deleteSavedNeon();
  const response=reply({saved:false,deleted,storageActivated:false,readOnly:true});
  response.cookies.set(LIVE_NEON_COOKIE,"",{
   httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:LIVE_NEON_PATH,maxAge:0
  });
  return response;
 }catch{return reply({error:"Unable to disconnect saved Neon connection"},503);}
}
