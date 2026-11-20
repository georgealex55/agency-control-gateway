import {NextRequest,NextResponse} from "next/server";
import {neon} from "@neondatabase/serverless";
import {adminAuthenticated,sameOrigin} from "@/lib/portal-auth";
import {validateCustomerNeonUrl} from "@/lib/reach-neon-customer-config";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
/**
 * Owner-authorized, one-shot read-only Neon connectivity check.
 * No DSN/password is stored, returned, logged, put in a cookie, or persisted.
 * No DDL, DML, project provisioning, environment changes or account activation.
 */
export async function POST(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Owner sign-in required."},401);
 if(!sameOrigin(req))return reply({error:"Invalid request origin."},403);
 const declared=Number(req.headers.get("content-length")||0);
 if(declared>4600)return reply({error:"Connection details are too long."},413);
 let raw:string;
 try{raw=await req.text();}catch{return reply({error:"Invalid request body."},400);}
 if(raw.length>4600)return reply({error:"Connection details are too long."},413);
 let payload:unknown;
 try{payload=JSON.parse(raw);}catch{return reply({error:"Invalid request body."},400);}
 if(!payload||typeof payload!=="object"||Array.isArray(payload))
  return reply({error:"Invalid connection details."},400);
 const data=payload as Record<string,unknown>;
 if(Object.keys(data).length!==1||!("connectionString" in data))
  return reply({error:"Only the Neon connection string is accepted."},400);
 let connection:ReturnType<typeof validateCustomerNeonUrl>;
 try{connection=validateCustomerNeonUrl(data.connectionString);}
 catch(e){return reply({error:e instanceof Error?e.message:"Invalid Neon connection string."},422);}
 try{
  const sql=neon(connection.connectionString,{fetchOptions:{signal:AbortSignal.timeout(8000)}});
  const result=await sql.query("SELECT current_database()::text AS database_name, current_user::text AS role_name");
  const row=Array.isArray(result)?result[0] as Record<string,unknown>|undefined:undefined;
  if(!row||row.database_name!==connection.databaseName||typeof row.role_name!=="string")
   return reply({error:"The Neon server did not confirm the expected database."},422);
  return reply({verified:true,connectionSaved:false,storageActivated:false,
   check:"read_only_select",database:String(row.database_name).slice(0,64),
   role:String(row.role_name).slice(0,128),
   note:"Connectivity verified for this attempt only. No credentials were saved."});
 }catch{
  return reply({error:"Could not verify Neon connectivity. Check the endpoint, database, role, password and TLS settings.",connectionSaved:false},422);
 }
}
