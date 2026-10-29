import { executeSdkReadAction } from "@/lib/ghl-actions";
type R=Record<string,unknown>;
export type ScanLocation={id:string;locationId:string;name:string;features:Record<string,{status:"available"|"unavailable";count:number|null}>};
function obj(v:unknown):R|null {return v!==null&&typeof v==="object"&&!Array.isArray(v)?v as R:null;}
function findItems(v:unknown,key:string,depth=0):unknown[]|null {
  if(depth>4||v==null)return null;
  if(Array.isArray(v)){for(const item of v){const found=findItems(item,key,depth+1);if(found!==null)return found;}return null;}
  const o=obj(v);if(!o)return null;
  if(Array.isArray(o[key]))return o[key] as unknown[];
  for(const child of Object.values(o)){if(child!==v&&typeof child==="object"){const found=findItems(child,key,depth+1);if(found!==null)return found;}}
  return null;
}
function field(o:R,keys:string[]):string {
  for(const key of keys){const v=o[key];if(typeof v==="string"&&v.trim())return v.trim();}
  return "";
}
/** Single agency account integration. Subaccounts are discovered from the agency, not separately authorized by clients. GHL may mint server-side location tokens from the agency OAuth grant for module reads. */
export async function scanAgency():Promise<{locations:ScanLocation[];discovered:number;limited:boolean}> {
  // Fail closed if no primary agency is selected: never scan arbitrary accessible locations.
  if(!process.env.GHL_COMPANY_ID?.trim()) throw new Error("Primary GHL agency company ID is not configured");
  const r=await executeSdkReadAction("list_locations",{limit:8});
  if(!r?.ok)throw new Error("Location discovery unavailable");
  const locations=findItems(r.data,"locations");
  if(locations===null)throw new Error("Unrecognized location list");
  const summary:ScanLocation[]=[];
  for(const row of locations.slice(0,8)){
    const o=obj(row);if(!o)continue;
    const locationId=field(o,["id","_id","locationId"]);if(!locationId)continue;
    const features:ScanLocation["features"]={};
    const checks:[string,string,string][]=[
      ["website","list_funnels","funnels"],
      ["automation","list_workflows","workflows"],
      ["social","list_social_accounts","accounts"],
      ["blogs","list_blogs","blogs"]
    ];
    const results=await Promise.all(checks.map(async ([key,action,collection])=>{
      try{
        const value=await executeSdkReadAction(action,{locationId,limit:20,offset:0,skip:0});
        const items=value?.ok?findItems(value.data,collection):null;
        return [key,items===null?{status:"unavailable" as const,count:null}:{status:"available" as const,count:items.length}] as const;
      }catch{return [key,{status:"unavailable" as const,count:null}] as const;}
    }));
    for(const [key,value] of results)features[key]=value;
    summary.push({id:locationId,locationId,name:(field(o,["name","businessName","companyName"])||"Unnamed workspace").slice(0,120),features});
  }
  return {connectionMode:"agency_only" as const,clientAuthorizationRequired:false,locations:summary,discovered:locations.length,limited:locations.length>=8};
}
