/** Control-plane-only service contracts. Upstream applications remain separate unchanged runtimes. */
export const UPSTREAM_ENGINES=["website","learning","crm","social","automation"] as const;
export type UpstreamEngine=typeof UPSTREAM_ENGINES[number];
export type EngineState="not_configured"|"ready_to_check"|"reachable"|"access_denied"|"app_unavailable"|"connection_failed"|"license_required";
export type EngineStatus={engine:UpstreamEngine;name:string;source:string;state:EngineState;configured:boolean;workspaceBound:boolean;detail:string;sampleNames:string[];readOnly:true};
export const ENGINES:Record<UpstreamEngine,{name:string;source:string;doctype?:string;runtime:string;setupKeys:readonly string[]}> = {
 website:{name:"Website Studio",source:"frappe/builder",doctype:"Builder Page",runtime:"Frappe v16 / MariaDB / Redis / workers",setupKeys:["UPSTREAM_FRAPPE_BASE_URL","UPSTREAM_FRAPPE_API_KEY","UPSTREAM_FRAPPE_API_SECRET","UPSTREAM_FRAPPE_WORKSPACE_ID"]},
 learning:{name:"Learning Studio",source:"frappe/lms",doctype:"LMS Course",runtime:"Frappe v16 / MariaDB / Redis / workers",setupKeys:["UPSTREAM_FRAPPE_BASE_URL","UPSTREAM_FRAPPE_API_KEY","UPSTREAM_FRAPPE_API_SECRET","UPSTREAM_FRAPPE_WORKSPACE_ID"]},
 crm:{name:"Customer Hub",source:"frappe/crm",doctype:"CRM Lead",runtime:"Frappe v16 / MariaDB / Redis / workers",setupKeys:["UPSTREAM_FRAPPE_BASE_URL","UPSTREAM_FRAPPE_API_KEY","UPSTREAM_FRAPPE_API_SECRET","UPSTREAM_FRAPPE_WORKSPACE_ID"]},
 social:{name:"Social Intelligence",source:"gitroomhq/postiz-app",runtime:"Postiz Node / PostgreSQL / Redis / workers",setupKeys:["SOCIAL_POSTIZ_BASE_URL","SOCIAL_POSTIZ_API_KEY","SOCIAL_POSTIZ_ORG_ID","SOCIAL_POSTIZ_WORKSPACE_ID"]},
 automation:{name:"Workflow Studio",source:"activepieces/activepieces",runtime:"Activepieces Node / PostgreSQL / Redis / workers",setupKeys:["UPSTREAM_ACTIVEPIECES_BASE_URL","UPSTREAM_ACTIVEPIECES_API_KEY","UPSTREAM_ACTIVEPIECES_PROJECT_ID","UPSTREAM_ACTIVEPIECES_WORKSPACE_ID"]}
};
export function validEngine(value:unknown):value is UpstreamEngine{return typeof value==="string"&&UPSTREAM_ENGINES.some(v=>v===value);}
export function publicOrigin(input:string):string{
 const u=new URL(input);
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.pathname!=="/"||u.search||u.hash)throw Error("Engine service must be a clean HTTPS origin");
 const h=u.hostname.toLowerCase();
 if(h.length>253||!h.includes(".")||h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".localhost")||h.endsWith(".test")||
  /^[0-9.]+$/.test(h)||h.includes(":")||!(/^[a-z0-9.-]+$/.test(h))||h.split(".").some(p=>p.length<1||p.length>63||p.startsWith("-")||p.endsWith("-")))throw Error("Private or invalid engine service host");
 return u.origin;
}
export function engineSetup(env:Record<string,string|undefined>,engine:UpstreamEngine,workspaceId:string){
 const def=ENGINES[engine];
 const missing=def.setupKeys.filter(k=>!env[k]?.trim());
 const targetKey=engine==="social"?"SOCIAL_POSTIZ_WORKSPACE_ID":engine==="automation"?"UPSTREAM_ACTIVEPIECES_WORKSPACE_ID":"UPSTREAM_FRAPPE_WORKSPACE_ID";
 let origin:string|null=null;
 const urlKey=engine==="social"?"SOCIAL_POSTIZ_BASE_URL":engine==="automation"?"UPSTREAM_ACTIVEPIECES_BASE_URL":"UPSTREAM_FRAPPE_BASE_URL";
 if(env[urlKey]){try{origin=publicOrigin(env[urlKey]);}catch{missing.push(urlKey+" (invalid HTTPS origin)");}}
 const workspaceBound=Boolean(env[targetKey]&&env[targetKey]===workspaceId);
 if(!workspaceBound&&!missing.includes(targetKey))missing.push(targetKey+" (different workspace)");
 if(engine==="automation"&&env.UPSTREAM_ACTIVEPIECES_PROJECT_ID&&!/^[A-Za-z0-9]{21}$/.test(env.UPSTREAM_ACTIVEPIECES_PROJECT_ID))missing.push("UPSTREAM_ACTIVEPIECES_PROJECT_ID (invalid ID)");
 const configured=missing.length===0&&workspaceBound&&Boolean(origin);
 return {engine,name:def.name,source:def.source,setupKeys:[...def.setupKeys],missingKeys:missing,configured,workspaceBound,origin:configured?origin:null,readOnly:true as const};
}
