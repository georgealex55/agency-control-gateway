"use client";
import {useEffect,useState} from "react";
import {ENGINES,UPSTREAM_ENGINES,type UpstreamEngine,type EngineStatus} from "@/lib/upstream-engine-contract";
type Workspace={id:string;name:string};
type Setup={engine:UpstreamEngine;name:string;source:string;configured:boolean;workspaceBound:boolean;origin:string|null;setupKeys:string[];missingKeys:string[];readOnly:true};
const docs:Record<UpstreamEngine,string>={
 website:"https://docs.frappe.io/framework/user/en/api/rest",
 learning:"https://docs.frappe.io/framework/user/en/api/rest",
 crm:"https://docs.frappe.io/crm/introduction/installation",
 social:"https://docs.postiz.com/public-api",
 automation:"https://www.activepieces.com/docs/endpoints/overview"
};
export default function UpstreamIntegrations(){
 const [workspaces,setWorkspaces]=useState<Workspace[]>([]),[selected,setSelected]=useState("");
 const [setups,setSetups]=useState<Setup[]>([]);
 const [checks,setChecks]=useState<Partial<Record<UpstreamEngine,EngineStatus>>>({});
 const [busy,setBusy]=useState<UpstreamEngine|null>(null),[loading,setLoading]=useState(true),[message,setMessage]=useState("");
 useEffect(()=>{
  let active=true;
  fetch("/api/platform/workspaces",{cache:"no-store",credentials:"same-origin"}).then(async r=>{
   const j=await r.json();if(!r.ok)throw Error(j.error||"Workspaces unavailable");
   if(active){const list=Array.isArray(j.workspaces)?j.workspaces:[];setWorkspaces(list);setSelected(list[0]?.id||"");}
  }).catch(e=>{if(active)setMessage(e instanceof Error?e.message:"Cannot load workspaces");})
  .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  if(!selected){setSetups([]);setChecks({});return;}
  let active=true;setChecks({});
  fetch("/api/platform/engines?workspaceId="+encodeURIComponent(selected),{cache:"no-store",credentials:"same-origin"}).then(async r=>{
   const j=await r.json();if(!r.ok)throw Error(j.error||"Integration status unavailable");
   if(active)setSetups(Array.isArray(j.engines)?j.engines:[]);
  }).catch(e=>{if(active)setMessage(e instanceof Error?e.message:"Integration status unavailable");});
  return()=>{active=false;};
 },[selected]);
 async function check(engine:UpstreamEngine){
  if(!selected||busy)return;setBusy(engine);setMessage("");
  try{
   const r=await fetch("/api/platform/engines/check",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({workspaceId:selected,engine})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Engine verification unavailable");
   setChecks(prev=>({...prev,[engine]:j}));
  }catch(e){setMessage(e instanceof Error?e.message:"Engine verification failed");}
  finally{setBusy(null);}
 }
 const current=workspaces.find(w=>w.id===selected);
 return <section className="ag-card" aria-label="Upstream engine integrations">
  <div className="ag-platform-bar"><div><div className="ag-eyebrow">ORIGINAL OPEN-SOURCE ENGINES</div><h2>Connection control center</h2>
   <p>The original engines stay separate and unchanged. These checks read from each service; they do not create content or publish anything.</p></div>
   <div><label htmlFor="engine-workspace">Staging workspace</label><select id="engine-workspace" value={selected} onChange={e=>setSelected(e.target.value)}>
    {workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
   </select></div></div>
  {loading&&<p>Loading available workspaces…</p>}
  {!loading&&workspaces.length===0&&<div className="ag-ws-note">No staging workspace is configured. Create one in the Workspaces tab before connecting an upstream engine.</div>}
  {message&&<div className="ag-error" role="alert">{message}</div>}
  <div className="ag-modulegrid">
   {UPSTREAM_ENGINES.map(engine=>{
    const def=ENGINES[engine],setup=setups.find(s=>s.engine===engine),status=checks[engine];
    return <div className="ag-card" key={engine}>
      <div className="ag-eyebrow">{def.source}</div><h3>{def.name}</h3>
      <p>{def.runtime}</p>
      <strong>{status?status.state.replaceAll("_"," "):setup?.configured?"Configured — not yet verified":"Awaiting upstream configuration"}</strong>
      {status?.detail&&<p>{status.detail}</p>}
      {status?.sampleNames?.length>0&&<div className="ag-ws-note">
       <b>Read-only sample from {current?.name||"workspace"}</b>
       <div className="ag-source-list">{status.sampleNames.map((name,i)=><div key={i}>{name}</div>)}</div>
      </div>}
      {setup?.missingKeys?.length>0&&<details><summary>Missing setup ({setup.missingKeys.length})</summary>
       <ul>{setup.missingKeys.map(k=><li key={k}><code>{k}</code></li>)}</ul>
      </details>}
      <div className="ag-social-actions">
       <button className="ag-secondary" disabled={!selected||!setup?.configured||busy!==null}
        onClick={()=>void check(engine)}>{busy===engine?"Checking…":"Verify engine API"}</button>
       <a href={docs[engine]} target="_blank" rel="noreferrer">API documentation</a>
      </div>
      <small>{setup?.configured?"Credentials configured for this workspace; no connectivity claim until verified.":"Backend runtime and workspace-specific read-only credentials required."}</small>
    </div>;
   })}
  </div>
  <div className="ag-ws-note"><b>Connection boundaries</b>
   <p>The Frappe Framework runs Builder, CRM and Learning as installed apps, with dedicated database/cache/worker services. Postiz and Activepieces also run separately. Vercel remains the agency control-plane only.</p>
   <p>Staging allows one administrator. API access is configured on the server for one explicitly mapped workspace per backend. No credentials, tokens or arbitrary upstream URLs are accepted from the browser.</p>
   <p>Postiz and Activepieces require their own upstream organizations/projects and appropriately licensed API access. Connection checks never send posts, edit pages, enroll learners or run automations.</p>
  </div>
 </section>;
}
