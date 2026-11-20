import {neon} from "@neondatabase/serverless";
import {readySql} from "@/lib/platform-store";
import {validWorkspaceId} from "@/lib/platform-validation";
/** Single-owner storage only. Not a multi-customer authorization solution. */
export function ownerSocialStorageConfigured(env:NodeJS.ProcessEnv=process.env):boolean{
 if(env.VERCEL_ENV!=="production"||env.REACH_SOCIAL_OWNER_STORAGE_ENABLED!=="true"||!validWorkspaceId(env.REACH_SOCIAL_OWNER_WORKSPACE_ID))return false;
 try{
  const u=new URL(env.REACH_SOCIAL_DATABASE_URL||"");
  return ["postgres:","postgresql:"].includes(u.protocol)&&u.hostname.endsWith(".neon.tech")&&
    decodeURIComponent(u.pathname.slice(1))==="reach_platform"&&u.username==="reach_app_runtime"&&
    Boolean(u.password)&&["require","verify-full"].includes(u.searchParams.get("sslmode")||"");
 }catch{return false;}
}
export async function ownerSocialWorkspace(){
 if(!ownerSocialStorageConfigured())throw Error("Owner social storage disabled");
 const id=process.env.REACH_SOCIAL_OWNER_WORKSPACE_ID!;
 const sql=neon(process.env.REACH_SOCIAL_DATABASE_URL!,{fetchOptions:{signal:AbortSignal.timeout(8000)}});
 const result=await sql.transaction([
  sql.query("SELECT set_config('reach.workspace_id',$1,true)",[id]),
  sql.query("SELECT id,name,slug FROM public.agency_platform_workspaces WHERE id=$1::uuid LIMIT 1",[id])
 ]);
 const row=(result[1] as {id:string;name:string;slug:string}[])[0];
 if(!row||row.id!==id)throw Error("Workspace not found");
 return[row];
}
export async function socialMetaWorkspaceDb(workspaceId:string){
 if(process.env.VERCEL_ENV!=="production")return readySql();
 if(!ownerSocialStorageConfigured()||workspaceId!==process.env.REACH_SOCIAL_OWNER_WORKSPACE_ID)
  throw Error("Social workspace unauthorized");
 const sql=neon(process.env.REACH_SOCIAL_DATABASE_URL!,{fetchOptions:{signal:AbortSignal.timeout(8000)}});
 return{query:async(query:string,params:unknown[]=[]):Promise<unknown>=>{
  const tx=await sql.transaction([
   sql.query("SELECT set_config('reach.workspace_id',$1,true)",[workspaceId]),
   sql.query(query,params)
  ]);
  return tx[1];
 }};
}
