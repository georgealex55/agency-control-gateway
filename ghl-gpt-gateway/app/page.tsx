"use client";
import { useEffect, useState, type FormEvent } from "react";
import { MODULES, SAMPLE_TENANTS, type ModuleKey } from "@/lib/agency-platform";

type View="overview"|"discover"|"clients"|"features"|"settings";
type ScanLocation={id:string;name:string;locationId:string;features:Record<string,{status:string;count:number|null}>};
const NAV:{id:View;label:string;icon:string}[]=[
  {id:"overview",label:"Overview",icon:"◫"},
  {id:"discover",label:"GHL Discovery",icon:"◎"},
  {id:"clients",label:"Client Workspaces",icon:"▦"},
  {id:"features",label:"Feature Catalog",icon:"▧"},
  {id:"settings",label:"Settings",icon:"⚙"}
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
      <div className="ag-side-foot"><span className="ag-signal"/> GHL integration preserved<small>Milestone 01 · Agency foundation</small></div>
    </aside>
    <div className="ag-main">
      <header className="ag-top"><div>Agency <span>/</span> <strong>{NAV.find(n=>n.id===view)?.label}</strong></div><div className="ag-topright"><span className="ag-stage"><span className="ag-signal"/> Preview foundation</span><button className="ag-avatar" onClick={()=>setView("settings")}>AC</button></div></header>
      <main className="ag-content">
        {view==="overview"&&<>
          <div className="ag-eyebrow">YOUR COMMAND CENTER</div>
          <div className="ag-intro-head"><div><h1>One platform. Every client.</h1><p>Powerful behind the scenes. Simple for the people using it.</p></div><button className="ag-primary" onClick={()=>setView("discover")}>◎ Discover GHL accounts →</button></div>
          <div className="ag-banner"><span>i</span><div><strong>Foundation milestone — sample client profiles</strong><p>No real customer information is shown on this page until a protected, read-only agency scan succeeds.</p></div><button onClick={()=>setView("discover")}>Connect →</button></div>
          <div className="ag-metrics"><Metric title="Sample workspaces" value="03" sub="Website · LMS · marketing" icon="▦"/><Metric title="Service modules" value="07" sub="Controlled feature access" icon="▧"/><Metric title="Proposed starter plan" value="$30" sub="Per month · planning only" icon="$"/><Metric title="Discovered GHL locations" value={locations?String(locations.length):"—"} sub={locations?"Read-only scan":"Scan not run"} icon="◎"/></div>
          <div className="ag-columns"><section className="ag-card"><Head title="Client experiences" sub="Tailored by business type."/><div className="ag-rows">{SAMPLE_TENANTS.map((t,i)=><button className="ag-tenant" key={t.id} onClick={()=>{setSelected(t.id);setView("clients");}}><span className={"ag-tenant-icon i"+i}>{["◈","▤","↗"][i]}</span><span><b>{t.name}</b><small>{t.category}</small></span><i>DEMO</i><em>›</em></button>)}</div></section>
          <section className="ag-card"><Head title="First milestone" sub="A safe path away from GHL clutter."/><div className="ag-steps"><Step number="01" title="Connect & inventory" sub="Inspect linked locations without writes." active/><Step number="02" title="Select client experience" sub="Website, learning, and marketing views."/><Step number="03" title="Approve capabilities" sub="Control available feature packages."/><Step number="04" title="Migrate after verification" sub="Maintain existing client environments." /></div></section></div>
        </>}
        {view==="discover"&&<>
          <div className="ag-eyebrow">INTEGRATION STUDIO</div><h1>Find everything in GHL.</h1><p className="ag-subhead">Discover connected locations and module counts without modifying live customer data.</p>
          <section className="ag-card ag-connect"><div className="ag-connecthead"><span className="ag-largeicon">◎</span><div><h2>GoHighLevel agency scanner</h2><p>Protected, official-SDK reads · up to 8 locations per scan</p></div><span className="ag-readonly">READ ONLY</span></div>
          {session.loaded&&!session.configured&&<div className="ag-note"><b>Admin access needs configuration</b><p>Configure <code>AGENCY_PORTAL_PASSWORD_SHA256</code> and <code>AGENCY_PORTAL_SESSION_SECRET</code> in your Vercel project. No GHL keys are sent to the browser.</p></div>}
          {session.configured&&!session.authenticated&&<form onSubmit={login} className="ag-login"><label htmlFor="adminpass">Administrator password</label><div><input id="adminpass" type="password" minLength={12} required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter admin password"/><button className="ag-primary" disabled={loading}>{loading?"Signing in…":"Unlock scanner →"}</button></div></form>}
          {session.authenticated&&<div className="ag-actionbar"><span className="ag-green">● Signed in as agency admin</span><div><button className="ag-secondary" onClick={logout}>Sign out</button><button className="ag-primary" disabled={scanLoading} onClick={scan}>{scanLoading?"Scanning…":"Run read-only scan →"}</button></div></div>}
          {error&&<p className="ag-error" role="alert">{error}</p>}
          </section>
          {locations&&session.authenticated?<section className="ag-card"><Head title={String(locations.length)+" GHL locations discovered"} sub={limited?"Showing first 8 locations. More pagination is a future milestone.":"Feature counts reflect only the first page of results."}/><div className="ag-rows">{locations.map(loc=><div key={loc.id} className="ag-location"><div><b>{loc.name}</b><small>Location: {loc.locationId}</small></div><div className="ag-tags">{Object.entries(loc.features).map(([name,data])=><span key={name} className={data.status==="available"?"ag-tag":"ag-tag muted"}>{name}: {data.count===null?"unavailable":data.count}</span>)}</div></div>)}</div>{locations.length===0&&<p>No locations returned for this connection.</p>}</section>:<section className="ag-card"><Head title="Discovery scope" sub="Inventory only, no content migration."/><div className="ag-scope">{[["⌂","Websites & funnels","Page/funnel inventory"],["⚡","Workflows","Existing automation definitions"],["#","Social accounts","Connected social profile inventory"],["▤","Blogs","Blog list availability"]].map(x=><div className="ag-scopeitem" key={x[1]}><span>{x[0]}</span><div><b>{x[1]}</b><small>{x[2]}</small></div></div>)}</div><p className="ag-footnote">Contact data, course content, messages, and page HTML are not exported or copied in this milestone.</p></section>}
        </>}
        {view==="clients"&&<>
          <div className="ag-eyebrow">CLIENT EXPERIENCE DESIGN</div><h1>Less clutter. Better results.</h1><p className="ag-subhead">These previews demonstrate what each of your three types of clients would see.</p>
          <div className="ag-clientlayout"><section className="ag-card"><input className="ag-search" placeholder="Search sample workspaces" aria-label="Search sample workspaces" value={filter} onChange={e=>setFilter(e.target.value)}/>{SAMPLE_TENANTS.filter(t=>t.name.toLowerCase().includes(filter.toLowerCase())).map(t=><button key={t.id} className={"ag-tenant "+(selected===t.id?"selected":"")} onClick={()=>setSelected(t.id)}><span className="ag-tenant-icon">▦</span><span><b>{t.name}</b><small>{t.category}</small></span><em>›</em></button>)}</section>
          <section className="ag-card"><div className="ag-previewtag">CLIENT VIEW PREVIEW <span>DEMO</span></div><h2>{demo.name}</h2><p>{demo.category}</p><div className="ag-modulegrid">{active.map(g=>{const m=MODULES.find(x=>x.key===g.module);return m?<div className="ag-module" key={g.module}><span>◈</span><b>{m.title}</b><small>{m.description}</small></div>:null;})}</div><div className="ag-footnote">Additional features stay hidden until agency approval and backend provisioning. <button onClick={()=>setView("features")}>View catalog →</button></div></section></div>
        </>}
        {view==="features"&&<>
          <div className="ag-eyebrow">FEATURE GOVERNANCE</div><h1>Give clients exactly what they need.</h1><p className="ag-subhead">Agency-approved modules, staged gradually. Requests below are previews—not billing or live activation.</p>
          <section className="ag-card"><Head title="Available modules" sub="Feature packages for your $30 entry-level model"/>{MODULES.map(m=><div key={m.key} className="ag-featurerow"><span className="ag-tenant-icon">{m.key==="lms"?"▤":m.key==="social"?"#":m.key==="automation"?"⚡":"◈"}</span><div><b>{m.title}</b><small>{m.description}</small></div>{m.upgrade?<button className={"ag-secondary "+(requests.includes(m.key)?"ag-selected":"")} onClick={()=>setRequests(v=>v.includes(m.key)?v.filter(x=>x!==m.key):[...v,m.key])}>{requests.includes(m.key)?"Staged ✓":"Preview request"}</button>:<span className="ag-included">Core package</span>}</div>)}<p className="ag-footnote">Preview requests remain in this browser screen. No GHL writes, payments or backend grants are performed.</p></section>
        </>}
        {view==="settings"&&<>
          <div className="ag-eyebrow">PLATFORM SETUP</div><h1>Secure by default.</h1><p className="ag-subhead">Integration and account controls for the first milestone.</p>
          <div className="ag-columns"><section className="ag-card"><Head title="Admin access"/><Status title="Administrator login" value={session.configured?"Configured":"Setup required"}/><Status title="Active session" value={session.authenticated?"Authenticated":"Not signed in"}/><Status title="Scanner" value="Read only"/><Status title="Client login" value="Not enabled"/></section><section className="ag-card"><Head title="Integration readiness"/><Status title="Existing GHL gateway" value="Preserved"/><Status title="Feature requests" value="Preview only"/><Status title="Stripe billing" value="Not connected"/><Status title="Frappe / Postiz" value="Not connected"/></section></div>
          <section className="ag-card"><Head title="Required Vercel secrets" sub="Never put secret values in the GitHub repo."/><code className="ag-code">AGENCY_PORTAL_PASSWORD_SHA256 = SHA-256 hash of a strong admin password</code><code className="ag-code">AGENCY_PORTAL_SESSION_SECRET = separate 32+ character random secret</code><p className="ag-footnote">Enable Vercel access protection / edge rate limits before using administrator login broadly. Existing gateway OAuth and API routes remain unchanged.</p></section>
        </>}
      </main><footer className="ag-footer">AGENCY CONTROL <span>·</span> Milestone 01 <span>·</span> Client data unchanged</footer>
    </div>
  </div>;
}
function Metric({title,value,sub,icon}:{title:string;value:string;sub:string;icon:string}){return <div className="ag-metric"><div><span>{title}</span><i>{icon}</i></div><strong>{value}</strong><small>{sub}</small></div>;}
function Head({title,sub}:{title:string;sub?:string}){return <div className="ag-cardhead"><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>;}
function Step({number,title,sub,active}:{number:string;title:string;sub:string;active?:boolean}){return <div className="ag-step"><span className={active?"active":""}>{number}</span><div><b>{title}</b><small>{sub}</small></div></div>;}
function Status({title,value}:{title:string;value:string}){return <div className="ag-status"><span>{title}</span><b>{value}</b></div>;}
