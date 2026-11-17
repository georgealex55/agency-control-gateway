"use client";
import { useEffect, useState, type FormEvent } from "react";
import { MODULES, SAMPLE_TENANTS, type ModuleKey } from "@/lib/agency-platform";
import PlatformWorkspaces from "./platform-workspaces";
import ServiceCatalog from "./service-catalog";
import SocialStudio from "./social-studio";
import {REACH_FEATURES,REACH_GROUPS,ReachFeatureDirectory,featureLabel,featureOpenable,type ReachFeature,type ReachScreen} from "./reach-ui-23";
import ReachCommandCenter from "./reach-command-center";

type View=ReachScreen;
type ScanLocation={id:string;name:string;locationId:string;features:Record<string,{status:string;count:number|null}>};
const NAV:{id:View;label:string;icon:string}[]=[
  {id:"overview",label:"Command Center",icon:"◫"},
  {id:"directory",label:"All Features",icon:"▦"},
  {id:"clients",label:"Workspaces",icon:"▦"},
  {id:"services",label:"Platform Studios",icon:"◈"},
  {id:"social",label:"Social Intelligence",icon:"↗"},
  {id:"features",label:"Feature Catalog",icon:"▧"},
  {id:"settings",label:"Settings",icon:"⚙"},
  {id:"discover",label:"GHL Migration (later)",icon:"◎"}
];
export default function Home() {
  const [view,setView]=useState<View>("overview");
  useEffect(()=>{if(["connections","calendar","media","insights"].includes(new URLSearchParams(window.location.search).get("social")||""))setView("social");},[]);
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
  const [theme,setTheme]=useState<"dark"|"light">("dark");
  const [accent,setAccent]=useState<"violet"|"blue"|"emerald">("violet");
  const [paletteOpen,setPaletteOpen]=useState(false);
  const [featureQuery,setFeatureQuery]=useState("");
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const [recent,setRecent]=useState<string[]>([]);
  useEffect(()=>{
    const keydown=(e:KeyboardEvent)=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setPaletteOpen(x=>!x);}
      if(e.key==="Escape"){setPaletteOpen(false);setMobileNavOpen(false);}
    };
    window.addEventListener("keydown",keydown);
    return ()=>window.removeEventListener("keydown",keydown);
  },[]);
  function openFeature(f:ReachFeature){
    if(!featureOpenable(f))return;
    setRecent(old=>[f.id,...old.filter(id=>id!==f.id)].slice(0,5));
    setPaletteOpen(false);setMobileNavOpen(false);setFeatureQuery("");
    if(f.href){window.location.assign(f.href);return;}
    if(f.screen){setView(f.screen);window.scrollTo({top:0,behavior:"smooth"});}
  }
  const selectedNavId:Record<View,string>={overview:"command",directory:"directory",clients:"workspaces",features:"features",services:"integrations",social:"social",settings:"settings",discover:"migration"};
  const searchResults=REACH_FEATURES.filter(f=>(f.title+" "+f.description+" "+f.detail).toLowerCase().includes(featureQuery.trim().toLowerCase()));

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
  return <div className="ag-shell reach-root" data-theme={theme} data-accent={accent}>
    <aside className={"ag-side reach-side "+(mobileNavOpen?"open":"")}>
      <div className="ag-brand reach-brand"><span className="ag-logo reach-logo">R<span>•</span></span><div><b>REACH</b><small>BUSINESS OPERATING SYSTEM</small></div><button className="reach-close-menu" onClick={()=>setMobileNavOpen(false)} aria-label="Close navigation">×</button></div>
      <div className="reach-side-heading">YOUR WORKSPACE <span>2.3</span></div>
      <nav aria-label="All REACH features" className="reach-nav">
        {REACH_GROUPS.map(group=><div className="reach-nav-group" key={group}><span className="reach-nav-caption">{group}</span>{REACH_FEATURES.filter(f=>f.group===group).map(f=>
          <button key={f.id} className={"ag-nav reach-nav-item "+(f.id===selectedNavId[view]?"current":"")} onClick={()=>openFeature(f)} disabled={!featureOpenable(f)} title={f.detail} aria-label={f.title+": "+featureLabel(f)}>
            <span className="ag-nav-icon" aria-hidden="true">{f.icon}</span><span>{f.title}</span><i className={"reach-nav-dot "+f.status} aria-hidden="true"/>
          </button>)}</div>)}
      </nav>
      <div className="ag-side-foot reach-side-foot"><span className="reach-owner-indicator"/> OWNER ONLY <small>Staging · provider publishing disabled</small></div>
    </aside>
    {mobileNavOpen&&<button className="reach-nav-backdrop" onClick={()=>setMobileNavOpen(false)} aria-label="Close feature navigation"/>}
    <div className="ag-main">
      <header className="ag-top reach-top">
        <div className="reach-breadcrumb"><button className="reach-mobile-menu" onClick={()=>setMobileNavOpen(true)} aria-label="Open all feature navigation" aria-expanded={mobileNavOpen}>☰</button><span>REACH</span><span aria-hidden="true">/</span><strong>{NAV.find(n=>n.id===view)?.label||"All Features"}</strong></div>
        <div className="ag-topright reach-topright">
          <button className="reach-search-trigger" onClick={()=>setPaletteOpen(true)} aria-label="Search REACH features"><span aria-hidden="true">⌕</span> Search features <kbd>Ctrl K</kbd></button>
          <label className="reach-accent-select">Accent <select aria-label="REACH accent color" value={accent} onChange={e=>setAccent(e.target.value as "violet"|"blue"|"emerald")}><option value="violet">Violet</option><option value="blue">Blue</option><option value="emerald">Emerald</option></select></label>
          <button className="reach-theme-button" onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} aria-label={theme==="dark"?"Switch to light theme":"Switch to dark theme"} title="Toggle color theme">{theme==="dark"?"☀":"☾"}</button>
          <span className="ag-stage">STAGING ONLY</span>
          <button className="ag-avatar" onClick={()=>setView("settings")} aria-label="Owner settings">R</button>
        </div>
      </header>
      {paletteOpen&&<div className="reach-palette-shade"><section role="dialog" aria-modal="true" aria-label="Find a REACH feature" className="reach-palette"><div className="reach-palette-top"><label htmlFor="reach-palette-search">Find a feature</label><button onClick={()=>setPaletteOpen(false)} aria-label="Close search">×</button></div><input id="reach-palette-search" type="search" autoFocus placeholder="Search CRM, social, inbox, automations…" value={featureQuery} onChange={e=>setFeatureQuery(e.target.value)}/><div className="reach-palette-results">{searchResults.map(f=><button key={f.id} disabled={!featureOpenable(f)} onClick={()=>openFeature(f)}><span className="reach-palette-icon" aria-hidden="true">{f.icon}</span><span><b>{f.title}</b><small>{f.group} · {f.detail}</small></span><em className={"reach-status "+f.status}>{featureLabel(f)}</em></button>)}{!searchResults.length&&<p>No matching tools.</p>}</div><p className="reach-palette-foot">Esc closes · disabled features cannot launch · no provider action is performed</p></section></div>}
      <main className="ag-content reach-content">
        {view==="overview"&&<ReachCommandCenter authenticated={session.authenticated} configured={session.configured} onOpen={openFeature} recent={recent} onUnauthorized={()=>setSession(s=>({...s,authenticated:false}))}/>}
        {view==="directory"&&<ReachFeatureDirectory onOpen={openFeature} recent={recent}/>}
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
        {view==="services"&&(!session.authenticated?
          <section className="ag-card"><h2>Administrator sign-in required</h2>
           {!session.configured?<p>Configure staging administrator access first.</p>:
            <form onSubmit={login} className="ag-login"><label htmlFor="engines-adminpass">Administrator password</label><div>
             <input id="engines-adminpass" type="password" minLength={12} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Administrator password"/>
             <button className="ag-primary" disabled={loading}>{loading?"Signing in…":"Unlock Platform Studios"}</button></div></form>}
           {error&&<p className="ag-error" role="alert">{error}</p>}
          </section>:<ServiceCatalog/>)} 
        {view==="social"&&(!session.authenticated?<section className="ag-card"><h2>Agency administrator access required</h2>
          {!session.configured?<p>Configure administrator access in the staging Vercel environment before managing real social drafts.</p>:<form onSubmit={login} className="ag-login"><label htmlFor="social-adminpass">Administrator password</label><div><input id="social-adminpass" type="password" minLength={12} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Administrator password"/><button className="ag-primary" disabled={loading}>{loading?"Signing in…":"Unlock Social Intelligence"}</button></div></form>}
          {error&&<p className="ag-error" role="alert">{error}</p>}
        </section>:<SocialStudio/>)}
        {view==="features"&&<>
          <div className="ag-eyebrow">FEATURE GOVERNANCE</div><h1>Give clients exactly what they need.</h1><p className="ag-subhead">Agency-approved modules, staged gradually. Requests below are previews—not billing or live activation.</p>
          <section className="ag-card"><Head title="Available modules" sub="Feature packages for your $30 entry-level model"/>{MODULES.map(m=><div key={m.key} className="ag-featurerow"><span className="ag-tenant-icon">{m.key==="lms"?"▤":m.key==="social"?"#":m.key==="automation"?"⚡":"◈"}</span><div><b>{m.title}</b><small>{m.description}</small></div>{m.upgrade?<button className={"ag-secondary "+(requests.includes(m.key)?"ag-selected":"")} onClick={()=>setRequests(v=>v.includes(m.key)?v.filter(x=>x!==m.key):[...v,m.key])}>{requests.includes(m.key)?"Staged ✓":"Preview request"}</button>:<span className="ag-included">Core package</span>}</div>)}<p className="ag-footnote">Preview requests remain in this browser screen. No GHL writes, payments or backend grants are performed.</p></section>
        </>}
        {view==="settings"&&<>
          <div className="ag-eyebrow">PLATFORM SETUP</div><h1>Secure by default.</h1><p className="ag-subhead">Integration and account controls for the first milestone.</p>
          <div className="ag-columns"><section className="ag-card"><Head title="Admin access"/><Status title="Administrator login" value={session.configured?"Configured":"Setup required"}/><Status title="Active session" value={session.authenticated?"Authenticated":"Not signed in"}/><Status title="Scanner" value="Deferred"/><Status title="User access" value="Single administrator only"/></section><section className="ag-card"><Head title="Integration readiness"/><Status title="GHL migration" value="Deferred to final phase"/><Status title="Feature requests" value="Preview only"/><Status title="Stripe billing" value="Not connected"/><Status title="Frappe / Postiz" value="Not connected"/></section></div>
          <section className="ag-card"><Head title="Required Vercel secrets" sub="Never put secret values in the GitHub repo."/><code className="ag-code">AGENCY_PORTAL_PASSWORD_SHA256 = SHA-256 hash of a strong admin password</code><code className="ag-code">AGENCY_PORTAL_SESSION_SECRET = separate 32+ character random secret</code><p className="ag-footnote">Enable Vercel access protection / edge rate limits before using administrator login broadly. Existing gateway OAuth and API routes remain unchanged.</p></section>
        </>}
      </main>
      <nav className="reach-mobile-bottom" aria-label="Mobile quick navigation">{["command","directory","social","settings"].map(id=>{const f=REACH_FEATURES.find(x=>x.id===id)!;return <button key={id} className={f.screen===view?"active":""} onClick={()=>openFeature(f)}><span aria-hidden="true">{f.icon}</span><small>{id==="command"?"Home":id==="directory"?"Features":id==="social"?"Social":"Settings"}</small></button>;})}<button onClick={()=>setMobileNavOpen(true)}><span aria-hidden="true">☰</span><small>All</small></button></nav>
      <footer className="ag-footer reach-footer">REACH 2.3 <span>·</span> Owner-only staging <span>·</span> No external publishing or GHL migration</footer>
    </div>
  </div>;
}
function Metric({title,value,sub,icon}:{title:string;value:string;sub:string;icon:string}){return <div className="ag-metric"><div><span>{title}</span><i>{icon}</i></div><strong>{value}</strong><small>{sub}</small></div>;}
function Head({title,sub}:{title:string;sub?:string}){return <div className="ag-cardhead"><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>;}
function Step({number,title,sub,active}:{number:string;title:string;sub:string;active?:boolean}){return <div className="ag-step"><span className={active?"active":""}>{number}</span><div><b>{title}</b><small>{sub}</small></div></div>;}
function Status({title,value}:{title:string;value:string}){return <div className="ag-status"><span>{title}</span><b>{value}</b></div>;}
