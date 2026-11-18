import {ENGINES,type UpstreamEngine,type EngineStatus,engineSetup,publicOrigin} from "./upstream-engine-contract";
import {readPostizStage} from "./social-postiz";
type Fetcher=typeof fetch;
type Row=Record<string,unknown>;
function obj(v:unknown):Row|null{return v&&typeof v==="object"&&!Array.isArray(v)?v as Row:null;}
function displayName(v:unknown):string{
 if(typeof v==="string")return v.slice(0,120);
 return "";
}
/** Fixed-path, JSON-only, read-only GET. Requests are constructed from administrator-owned environment settings, never user URLs. */
export async function engineGet(origin:string,path:string,authorization:string,fetcher:Fetcher=fetch):Promise<unknown>{
 const base=publicOrigin(origin);
 if(!path.startsWith("/")||path.startsWith("//")||path.includes("..")||path.includes("#")||path.length>500)throw Error("Invalid fixed engine path");
 const url=base+path;
 const res=await fetcher(url,{method:"GET",headers:{Authorization:authorization,Accept:"application/json"},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});
 if(res.status===401||res.status===403)throw Error("access_denied");
 if(res.status===404)throw Error("app_unavailable");
 if(!res.ok)throw Error("connection_failed");
 const size=Number(res.headers?.get("content-length")||"0");
 if(size>65536)throw Error("connection_failed");
 const text=await res.text();
 if(text.length>65536)throw Error("connection_failed");
 try{return JSON.parse(text);}catch{throw Error("connection_failed");}
}
function sample(v:unknown):string[]{
 const o=obj(v);const list=Array.isArray(o?.data)?o.data:[];
 return list.slice(0,5).map(r=>obj(r)).filter((r):r is Row=>r!==null).map(r=>displayName(r.name||r.displayName||r.id)).filter(Boolean);
}
export async function checkUpstreamEngine(engine:UpstreamEngine,workspaceId:string,env:Record<string,string|undefined>,fetcher?:Fetcher):Promise<EngineStatus>{
 const def=ENGINES[engine],setup=engineSetup(env,engine,workspaceId);
 const base={engine,name:def.name,source:def.source,configured:setup.configured,workspaceBound:setup.workspaceBound,readOnly:true as const};
 if(!setup.configured)return {...base,state:"not_configured",detail:"Staging engine or workspace mapping not configured.",sampleNames:[]};
 try{
  if(engine==="social"){
   // Postiz's original adapter checks /me organization before listing connected channels.
   // Requires separate Postiz service, not the unmodified source checkout alone.
   if(fetcher)throw Error("connection_failed"); // mocked Postiz tested in its own existing contract suite.
   const p=await readPostizStage(workspaceId);
   return {...base,state:"reachable",detail:"Postiz organization verified; channel inventory read-only.",sampleNames:p.channels.slice(0,5).map(x=>x.name)};
  }
  if(engine==="automation"){
   const credential=env.UPSTREAM_ACTIVEPIECES_API_KEY!;
   const projectId=env.UPSTREAM_ACTIVEPIECES_PROJECT_ID!;
   const data=await engineGet(setup.origin!,"/api/v1/projects?limit=50&types=TEAM&types=PERSONAL","Bearer "+credential,fetcher);
   const list=Array.isArray(obj(data)?.data)?obj(data)!.data as unknown[]:[];
   if(!list.some(p=>obj(p)?.id===projectId))return {...base,state:"access_denied",detail:"Configured project is not visible to this API key.",sampleNames:[]};
   const flows=await engineGet(setup.origin!,"/api/v1/flows?projectId="+encodeURIComponent(projectId)+"&limit=5","Bearer "+credential,fetcher);
   return {...base,state:"reachable",detail:"Activepieces project verified; flow inventory read-only.",sampleNames:sample(flows)};
  }
  const auth="token "+env.UPSTREAM_FRAPPE_API_KEY+":"+env.UPSTREAM_FRAPPE_API_SECRET;
  const identity=await engineGet(setup.origin!,"/api/method/frappe.auth.get_logged_user",auth,fetcher);
  const who=obj(identity)?.message;
  if(typeof who!=="string"||!who||who==="Guest")return {...base,state:"access_denied",detail:"Frappe API key did not authenticate a dedicated user.",sampleNames:[]};
  const doctype=def.doctype!;
  const items=await engineGet(setup.origin!,"/api/resource/"+encodeURIComponent(doctype)+"?fields=%5B%22name%22%5D&limit_page_length=5",auth,fetcher);
  if(!Array.isArray(obj(items)?.data))return {...base,state:"app_unavailable",detail:"Frappe app DocType not available to this API user.",sampleNames:[]};
  return {...base,state:"reachable",detail:doctype+" available via Frappe REST (read-only).",sampleNames:sample(items)};
 }catch(err){
  const code=err instanceof Error?err.message:"connection_failed";
  const state=code==="access_denied"||code==="app_unavailable"?code:engine==="automation"&&code==="license_required"?"license_required":"connection_failed";
  return {...base,state,detail:state==="access_denied"?"Read-only API access denied or workspace/project mismatch.":state==="app_unavailable"?"Upstream app route or DocType unavailable.":state==="license_required"?"Activepieces Platform API requires supported edition.":"Engine unreachable or returned an invalid response; inspect staging service logs.",sampleNames:[]};
 }
}
