"use client";
import {useEffect,useState,type FormEvent} from "react";
import {MODULES, type ModuleKey} from "@/lib/agency-platform";

type Plan="hidden"|"planned";
type Workspace={id:string;name:string;slug:string;businessType:string;createdAt:string;modules:Partial<Record<ModuleKey,Plan>>};
type ResponsePayload={configured?:boolean;workspaces?:Workspace[];error?:string;message?:string};
const TYPES=[{value:"website",label:"Websites & scheduling"},{value:"education",label:"Learning & courses"},{value:"marketing",label:"Marketing & funnels"},{value:"general",label:"General business"}];
export default function PlatformWorkspaces(){
  const [configured,setConfigured]=useState<boolean|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [items,setItems]=useState<Workspace[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [name,setName]=useState("");
  const [slug,setSlug]=useState("");
  const [type,setType]=useState("website");
  const [expanded,setExpanded]=useState(false);
  async function refresh(){
    setLoading(true);setError("");
    try{
      const r=await fetch("/api/platform/workspaces",{cache:"no-store",credentials:"same-origin"});
      const payload=await r.json() as ResponsePayload;
      if(!r.ok)throw new Error(payload.error||"Workspace inventory unavailable");
      setConfigured(payload.configured===true);
      const workspaces=Array.isArray(payload.workspaces)?payload.workspaces:[];
      setItems(workspaces);setSelected(current=>current&&workspaces.some(w=>w.id===current)?current:(workspaces[0]?.id||null));
    }catch(e){setError(e instanceof Error?e.message:"Workspace inventory unavailable");setConfigured(null);}
    finally{setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);
  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError("");
    try{
      const r=await fetch("/api/platform/workspaces",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,slug,businessType:type})});
      const v=await r.json();
      if(!r.ok)throw new Error(v.error||"Unable to create workspace");
      setName("");setSlug("");setExpanded(false);
      await refresh();setSelected(v.workspace.id);
    }catch(e){setError(e instanceof Error?e.message:"Create failed");}
    finally{setBusy(false);}
  }
  async function updatePlan(workspace:Workspace,module:ModuleKey,state:Plan){
    setBusy(true);setError("");
    try{
      const r=await fetch("/api/platform/workspaces/"+encodeURIComponent(workspace.id)+"/modules",{
        method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({module,state})
      });
      const v=await r.json();
      if(!r.ok)throw new Error(v.error||"Unable to update plan");
      setItems(prev=>prev.map(w=>w.id===workspace.id?{...w,modules:{...w.modules,[module]:state}}:w));
    }catch(e){setError(e instanceof Error?e.message:"Update failed");}
    finally{setBusy(false);}
  }
  const active=items.find(w=>w.id===selected)||null;
  return <div className="ag-platform-section">
    <div className="ag-platform-bar"><div><h2>Independent client workspaces</h2><p>Native to your platform — no GHL connection required.</p></div><button className="ag-secondary" onClick={()=>void refresh()} disabled={loading||busy}>↻ Refresh</button></div>
    {loading&&<div className="ag-note">Loading platform settings…</div>}
    {error&&<div className="ag-error" role="alert">{error}</div>}
    {!loading&&configured===false&&<div className="ag-note"><b>Platform storage setup required</b><p>Connect a dedicated Neon PostgreSQL database using <code>AGENCY_PLATFORM_DATABASE_URL</code> in Vercel. This is separate from GHL OAuth storage. No customer data has been created.</p></div>}
    {!loading&&configured===true&&<>
      <div className="ag-workspace-layout">
        <section className="ag-card"><div className="ag-platform-bar"><div><h2>Workspaces</h2><p>{items.length} provisioned in your control database</p></div><button className="ag-primary" onClick={()=>setExpanded(v=>!v)}>{expanded?"Cancel":"+ New"}</button></div>
        {expanded&&<form className="ag-ws-form" onSubmit={create}>
          <label>Business or workspace name<input value={name} onChange={e=>{setName(e.target.value);setSlug(s=>s||e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48));}} maxLength={120} minLength={2} required placeholder="Example: Downtown Wellness"/></label>
          <label>Workspace slug<input value={slug} onChange={e=>setSlug(e.target.value.toLowerCase())} pattern="[a-z][a-z0-9-]{2,47}" minLength={3} maxLength={48} required placeholder="downtown-wellness"/></label>
          <label>Focus<select value={type} onChange={e=>setType(e.target.value)}>{TYPES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
          <button className="ag-primary" disabled={busy}>{busy?"Creating…":"Create workspace"}</button>
        </form>}
        {items.map(w=><button key={w.id} className={"ag-tenant "+(selected===w.id?"selected":"")} onClick={()=>setSelected(w.id)}><span className="ag-tenant-icon">▦</span><span><b>{w.name}</b><small>{w.businessType} · /{w.slug}</small></span><em>›</em></button>)}
        {items.length===0&&!expanded&&<p className="ag-empty">No workspaces yet. Create your first agency-managed account.</p>}
        </section>
        <section className="ag-card">{active?<><div className="ag-previewtag">WORKSPACE CONFIGURATION <span>PRIVATE · AGENCY ONLY</span></div><h2>{active.name}</h2><p>/{active.slug} · {active.businessType}</p><div className="ag-ws-note">Feature planning is persistent, but not an active client subscription. Actual feature access requires separate identity, provisioning, and billing checks.</div>
          <div className="ag-ws-modules">{MODULES.map(m=><div key={m.key} className="ag-featurerow"><span className="ag-tenant-icon">◈</span><div><b>{m.title}</b><small>{m.description}</small></div><button disabled={busy} className={"ag-secondary "+(active.modules[m.key]==="planned"?"ag-selected":"")} onClick={()=>void updatePlan(active,m.key,active.modules[m.key]==="planned"?"hidden":"planned")}>{active.modules[m.key]==="planned"?"Planned ✓":"Add to plan"}</button></div>)}</div>
        </>:<><h2>Workspace details</h2><p>Select a workspace to manage its planned feature set.</p></>}</section>
      </div>
    </>}
    <p className="ag-footnote">No client portal logins, live billing, domain cutovers, publishing, or GHL operations are enabled by these controls.</p>
  </div>;
}
