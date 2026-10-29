"use client";
import { useEffect, useState, type FormEvent } from "react";
import { MODULES, SAMPLE_TENANTS, type ModuleKey } from "@/lib/agency-platform";
import PlatformWorkspaces from "./platform-workspaces";
import ServiceCatalog from "./service-catalog";

type View="overview"|"discover"|"clients"|"features"|"services"|"settings";
type ScanLocation={id:string;name:string;locationId:string;features:Record<string,{status:string;count:number|null}>};
const NAV:{id:View;label:string;icon:string}[]=[
  {id:"overview",label:"Overview",icon:"◫"},
  {id:"clients",label:"Workspaces",icon:"▦"},
  {id:"services",label:"Platform Studios",icon:"◈"},
  {id:"features",label:"Feature Catalog",icon:"▧"},
  {id:"settings",label:"Settings",icon:"⚙"},
  {id:"discover",label:"GHL Migration (later)",icon:"◎"}
];
export default function Home() {
  const [view,setView]=useState<View>("overview");
  const [selected,setSelected]=useState("sample-web");
  const [session,setSession]=useState({configured:false,authenticated:false,loaded:false});
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [scanLoading,setScanLoading]=useState(false);
  const [locations,setLocations]=useState<ScanLocation[]|null>(null);
  const [limited,setLimited]=useState(false);
  const [requests,setRequests]=useState<ModuleKey[]>([]);
  const [filter,setFilter]=useState("");
  useEffect(()=>{
    fetch("/api/portal/session",{cache:"no-store"}).then(r=>r.json())
      .then(v=>setSession({configured:v.configured===true,authenticated:v.authenticated===true,loaded:true}))
      .catch(()=>setSession({configured:false,authenticated:false,loaded:true}));
  },[]);
  const demo=SAMPLE_TENANTS.find(t=>t.id===selected)||SAMPLE_TENANTS[0];
  const active=demo.grants.filter(g=>g.approved&&g.provisioned&&g.billing==="active");
  async function login(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");setLoading(true);
    try{
      const r=await fetch("/api/portal/session",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({password})});
      const v=await r.json();
      if(!r.ok)throw new Error(v.error||"Sign in failed");
      setPassword("");setSession(s=>({...s,authenticated:true}));
    }catch(e){setError(e instanceof Error?e.message:"Sign in failed");}
    finally{setLoading(false);}
  }
  async function logout(){
    await fetch("/api/portal/session",{method:"DELETE",credentials:"same-origin"});
    setSession(s=>({...s,authenticated:false}));setLocations(null);
  }
  async function scan(){
    setError("");setScanLoading(true);
    try{
      const r=await fetch("/api/portal/scan",{method:"POST",credentials:"same-origin"});
      const v=await r.json();
      if(!r.ok)throw new Error(v.error||"Scan unavailable");
      setLocations(Array.isArray(v.locations)?v.locations:[]);setLimited(v.limited===true);
    }catch(e){setError(e instanceof Error?e.message:"Scan unavailable");}
    finally{setScanLoading(false);}
  }
  return <div className="ag-shell">
    <aside className="ag-side">
      <div className="ag-brand"><span className="ag-logo">A<span>•</span></span><div><b>Agency Control</b><small>UNIFIED WORKSPACE</small></div></div>
      <span className="ag-caption">PLATFORM</span>
      <nav aria-label="Main navigation">{NAV.map(n=><button key={n.id} className={"ag-nav "+(view===n.id?"current":"")} onClick={()=>setView(n.id)}><span className="ag-nav-icon">{n.icon}</span><span>{n.label}</span></button>)}</nav>
      <div className="ag-side-foot"><span className="ag-signal"/> Independent platform core<small>Milestone 02 · Workspaces</small></div>
    </aside>
    <div className="ag-main">
      <header className="ag-top"><div>Agency <span>/</span> <strong>{NAV.find(n=>n.id===view)?.label}</strong></div><div className="ag-topright"><span className="ag-stage"><span className="ag-signal"/> Preview foundation</span><button className="ag-avatar" onClick={()=>setView("settings")}>AC</button></div></header>
      <main className="ag-content">
        {view==="overview"&&<>
          <div className="ag-eyebrow">YOUR COMMAND CENTER</div>
          <div className="ag-intro-head"><div><h1>Build your platform. Your way.</h1><p>Powerful behind the scenes. Simple for the people using it.</p></div><button className="ag-primary" onClick={()=>setView("discover")}>◎ Scan my agency →</button></div>
          <div className="ag-banner"><span>i</span><div><strong>Milestone 2 — independent platform core</strong><p>Platform workspaces and modules are independent of GHL. Agency scanning is reserved for the final migration.</p></div><button onClick={()=>setView("clients")}>Workspaces →</button></div>
          <div className="ag-metrics"><Metric title="Demo profiles" value="03" sub="Examples, not actual accounts" icon="▦"/><Metric title="Service modules" value="07" sub="Controlled feature access" icon="▧"/><Metric title="Proposed starter plan" value="$30" sub="Per month · planning only" icon="$"/><Metric title="Agency subaccounts found" value={locations?String(locations.length):"—"} sub={locations?"Read-only scan":"Scan not run"} icon="◎"/></div>
          <div className="ag-columns"><section className="ag-card"><Head title="Example client experiences" sub="Samples of the workspace templates."/><div className="ag-rows">{SAMPLE_TENANTS.map((t,i)=><button className="ag-tenant" key={t.id} onClick={()=>{setSelected(t.id);setView("clients");}}><span className={"ag-tenant-icon i"+i}>{["◈","▤","↗"][i]}</span><span><b>{t.name}</b><small>{t.category}</small></span><i>DEMO</i><em>›</em></button>)}</div></section>
          <section className="ag-card"><Head title="Replacement roadmap" sub="Build independently before importing anything."/><div className="ag-steps"><Step number="01" title="Agency scan & inventory" sub="Discover subaccounts through your main connection." active/><Step number="02" title="Open-source service engines" sub="Pinned Frappe, Postiz and workflow sources."/><Step number="03" title="Client access & billing" sub="Account invitations and server-side grants."/><Step number="04" title="GHL migration last" sub="Only after replacement features are proven." /></div></section></div>
        </>}
        {view==="discover"&&<>
          <div className="ag-eyebrow">FINAL PHASE · NOT CONNECTING</div><h1>GHL migration comes last.</h1>
          <p className="ag-subhead">Build websites, courses, CRM, scheduling and social automation on your own platform first. Only after those tools pass acceptance tests will you inspect and migrate agency records from GoHighLevel.</p>
          <section className="ag-card"><Head title="Current migration boundary" sub="Existing gateway integration preserved but not required for this milestone."/>
            <div className="ag-ws-note"><b>No GHL scanning or connection is needed now.</b><p>Client workspaces and feature planning are native to Agency Control and are designed to be completely independent of the GHL account.</p></div>
            <div className="ag-scope">{[["01","Build core","Workspaces, permissions and modules"],["02","Build services","Websites, learning, CRM and social"],["03","Verify replacement","Staging tests and client acceptance"],["04","Import from GHL","Agency-only authorization and migration"]].map(x=><div className="ag-scopeitem" key={x[0]}><span>{x[0]}</span><div><b>{x[1]}</b><small>{x[2]}</small></div></div>)}</div>
            <p className="ag-footnote">No scan, OAuth installation, customer data transfer, or external service connection is performed from this page.</p>
          </section>
        </>}
        {view==="clients"&&<>
          <div className="ag-eyebrow">PLATFORM FOUNDATION</div><h1>Your own client workspaces.</h1>
          <p className="ag-subhead">Create business accounts and plan their features here without depending on GHL.</p>
          {session.loaded&&!session.configured&&<div className="ag-note"><b>Administrator sign-in must be configured first.</b><p>Set <code>AGENCY_PORTAL_PASSWORD_SHA256</code> and <code>AGENCY_PORTAL_SESSION_SECRET</code> in Vercel. Once signed in, a separate platform database can store workspaces and feature plans.</p></div>}
          {session.configured&&!session.authenticated&&<section className="ag-card"><Head title="Agency administrator login" sub="Required to read and manage your platform database."/><form onSubmit={login} className="ag-login"><label htmlFor="platform-adminpass">Administrator password</label><div><input id="platform-adminpass" type="password" minLength={12} autoComplete="current-password" required placeholder="Administrator password" value={password} onChange={e=>setPassword(e.target.value)}/><button className="ag-primary" disabled={loading}>{loading?"Signing in…":"Sign in →"}</button></div></form>{error&&<p className="ag-error" role="alert">{error}</p>}</section>}
          {session.authenticated&&<PlatformWorkspaces/>}
          {!session.authenticated&&<section className="ag-card"><Head title="Example workspace types" sub="Design references only; they are not real client accounts."/><div className="ag-rows">{SAMPLE_TENANTS.map(t=><div className="ag-tenant" key={t.id}><span className="ag-tenant-icon">▦</span><span><b>{t.name}</b><small>{t.category} · SAMPLE</small></span></div>)}</div></section>}
        </>}
        {view==="services"&&<ServiceCatalog/>}
        {view==="features"&&<>
          <div className="ag-eyebrow">FEATURE GOVERNANCE</div><h1>Give clients exactly what they need.</h1><p className="ag-subhead">Agency-approved modules, staged gradually. Requests below are previews—not billing or live activation.</p>
          <section className="ag-card"><Head title="Available modules" sub="Feature packages for your $30 entry-level model"/>{MODULES.map(m=><div key={m.key} className="ag-featurerow"><span className="ag-tenant-icon">{m.key==="lms"?"▤":m.key==="social"?"#":m.key==="automation"?"⚡":"◈"}</span><div><b>{m.title}</b><small>{m.description}</small></div>{m.upgrade?<button className={"ag-secondary "+(requests.includes(m.key)?"ag-selected":"")} onClick={()=>setRequests(v=>v.includes(m.key)?v.filter(x=>x!==m.key):[...v,m.key])}>{requests.includes(m.key)?"Staged ✓":"Preview request"}</button>:<span className="ag-included">Core package</span>}</div>)}<p className="ag-footnote">Preview requests remain in this browser screen. No GHL writes, payments or backend grants are performed.</p></section>
        </>}
        {view==="settings"&&<>
          <div className="ag-eyebrow">PLATFORM SETUP</div><h1>Secure by default.</h1><p className="ag-subhead">Integration and account controls for the first milestone.</p>
          <div className="ag-columns"><section className="ag-card"><Head title="Admin access"/><Status title="Administrator login" value={session.configured?"Configured":"Setup required"}/><Status title="Active session" value={session.authenticated?"Authenticated":"Not signed in"}/><Status title="Scanner" value="Read only"/><Status title="Client login" value="Not enabled"/></section><section className="ag-card"><Head title="Integration readiness"/><Status title="GHL migration" value="Deferred to final phase"/><Status title="Feature requests" value="Preview only"/><Status title="Stripe billing" value="Not connected"/><Status title="Frappe / Postiz" value="Not connected"/></section></div>
          <section className="ag-card"><Head title="Required Vercel secrets" sub="Never put secret values in the GitHub repo."/><code className="ag-code">AGENCY_PORTAL_PASSWORD_SHA256 = SHA-256 hash of a strong admin password</code><code className="ag-code">AGENCY_PORTAL_SESSION_SECRET = separate 32+ character random secret</code><p className="ag-footnote">Enable Vercel access protection / edge rate limits before using administrator login broadly. Existing gateway OAuth and API routes remain unchanged.</p></section>
        </>}
      </main><footer className="ag-footer">AGENCY CONTROL <span>·</span> Milestone 02 <span>·</span> No GHL migration</footer>
    </div>
  </div>;
}
function Metric({title,value,sub,icon}:{title:string;value:string;sub:string;icon:string}){return <div className="ag-metric"><div><span>{title}</span><i>{icon}</i></div><strong>{value}</strong><small>{sub}</small></div>;}
function Head({title,sub}:{title:string;sub?:string}){return <div className="ag-cardhead"><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>;}
function Step({number,title,sub,active}:{number:string;title:string;sub:string;active?:boolean}){return <div className="ag-step"><span className={active?"active":""}>{number}</span><div><b>{title}</b><small>{sub}</small></div></div>;}
function Status({title,value}:{title:string;value:string}){return <div className="ag-status"><span>{title}</span><b>{value}</b></div>;}
