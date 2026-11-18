"use client";
import {useMemo,useState} from "react";

export type ReachScreen="overview"|"directory"|"clients"|"features"|"services"|"social"|"settings"|"discover";
export type ReachFeature={id:string;title:string;group:string;description:string;status:"staging"|"source"|"planned"|"disabled";screen?:ReachScreen;href?:string;detail:string;icon:string};
// Navigation-only metadata. This does not grant permissions or claim a connected provider.
export const REACH_FEATURES:ReachFeature[]=[
 {id:"command",title:"Command Center",group:"Workspace",description:"Owner overview, platform readiness and shortcuts",status:"staging",screen:"overview",detail:"Interface only; no fabricated business metrics",icon:"◈"},
 {id:"directory",title:"All Features",group:"Workspace",description:"Explore every module and its actual readiness",status:"staging",screen:"directory",detail:"Includes planned and disabled features",icon:"▦"},
 {id:"workspaces",title:"Workspaces",group:"Workspace",description:"Isolated business workspaces and feature plans",status:"staging",screen:"clients",detail:"Administrator sign-in required",icon:"▥"},
 {id:"contacts",title:"CRM & Contacts",group:"Customers",description:"Contacts, customer history and pipelines",status:"source",screen:"services",detail:"Engine/reference integration; not a live CRM workspace",icon:"◎"},
 {id:"inbox",title:"Unified Inbox",group:"Customers",description:"Messages, email and customer conversation filters",status:"planned",detail:"No live messaging or provider inbox yet",icon:"✉"},
 {id:"calls",title:"Calls & Voicemail",group:"Customers",description:"Call tracking, forwarding, live pickup and AI reception",status:"planned",detail:"Phone provider configuration and consent required",icon:"☎"},
 {id:"pipelines",title:"Pipelines",group:"Customers",description:"Lead stages and customer activity tracking",status:"source",screen:"services",detail:"CRM engine groundwork, not operational lead data",icon:"▤"},
 {id:"social",title:"Social Studio",group:"Marketing",description:"Internal drafts, approvals, content plans and calendar",status:"staging",screen:"social",detail:"Administrator-only; external publishing disabled",icon:"↗"},
 {id:"social-connections",title:"Social Connections",group:"Marketing",description:"Meta consent readiness, accounts and provider status",status:"staging",href:"/connections",detail:"Owner-authorized read-only provider connections; requires configured apps and storage",icon:"⛓"},
 {id:"social-calendar",title:"Social Calendar",group:"Marketing",description:"Internal channel plans and post dates",status:"staging",href:"/?social=calendar",detail:"Internal plans only; no external scheduling",icon:"▦"},
 {id:"media",title:"Media Library",group:"Marketing",description:"Private staged media metadata and links",status:"staging",href:"/?social=media",detail:"Media metadata; private uploads gated",icon:"▧"},
 {id:"website",title:"Website Builder",group:"Marketing",description:"Websites, forms and domain tools",status:"source",screen:"services",detail:"Source/runtime preparation only",icon:"⌂"},
 {id:"funnels",title:"Funnels & Forms",group:"Marketing",description:"Landing pages and intake forms",status:"source",screen:"services",detail:"Module planning; no public intake enabled",icon:"◇"},
 {id:"reviews",title:"Reviews & Reputation",group:"Marketing",description:"Reviews, listings and business presence",status:"planned",detail:"No review-provider connection yet",icon:"★"},
 {id:"automations",title:"Automations",group:"Operations",description:"Visual rules, approvals and workflow history",status:"source",screen:"services",detail:"Reference engines only; outbound sends disabled",icon:"⚡"},
 {id:"tasks",title:"Tasks & Alerts",group:"Operations",description:"Prioritized to-dos, action center and reminders",status:"planned",detail:"No live task queue is represented",icon:"☷"},
 {id:"calendar",title:"Appointments",group:"Operations",description:"Bookings, appointments and staff availability",status:"source",screen:"services",detail:"Service groundwork only; no booking availability",icon:"◷"},
 {id:"courses",title:"Learning Studio",group:"Operations",description:"Online courses, lessons and student records",status:"source",screen:"services",detail:"Standalone engine/reference integration",icon:"▣"},
 {id:"ai",title:"AI Assistant",group:"Intelligence",description:"Dedicated assistant workspace and approved rules",status:"planned",detail:"Not connected to customer data or provider keys",icon:"✦"},
 {id:"insights",title:"Internal Insights",group:"Intelligence",description:"Draft and dry-run delivery statistics",status:"staging",href:"/?social=insights",detail:"Internal statistics, not external engagement",icon:"▥"},
 {id:"reporting",title:"Business Analytics",group:"Intelligence",description:"Actual KPIs, trends and plain-language interpretation",status:"planned",detail:"Real customer KPIs not yet available",icon:"▤"},
 {id:"neon",title:"Neon Connections",group:"Platform",description:"Staging database configuration and readiness",status:"staging",href:"/reach-connections",detail:"Admin/auth gates apply; no database provisioning",icon:"⛁"},
 {id:"integrations",title:"Integration Catalog",group:"Platform",description:"Source/runtime integration and connection setup",status:"staging",screen:"services",detail:"Not all connectors are installed or authenticated",icon:"⛓"},
 {id:"features",title:"Module Governance",group:"Platform",description:"Feature permissions and preview requests",status:"staging",screen:"features",detail:"Requests are previews, not actual grants",icon:"▣"},
 {id:"settings",title:"Owner Settings",group:"Platform",description:"Administrator access and setup requirements",status:"staging",screen:"settings",detail:"Single owner; no client logins",icon:"⚙"},
 {id:"migration",title:"GHL Migration",group:"Platform",description:"Controlled import after independent features pass",status:"disabled",screen:"discover",detail:"Deferred; no scanning, import or writes enabled",icon:"⇥"}
];
export const REACH_GROUPS=["Workspace","Customers","Marketing","Operations","Intelligence","Platform"] as const;
export function featureLabel(f:ReachFeature){return f.status==="staging"?"Staging":f.status==="source"?"Source only":f.status==="disabled"?"Disabled":"Planned";}
export function featureOpenable(f:ReachFeature){return f.status!=="disabled"&&Boolean(f.screen||f.href);}
type FeatureProps={onOpen:(f:ReachFeature)=>void;recent:string[]};
export function ReachFeatureDirectory({onOpen,recent}:FeatureProps){
 const [query,setQuery]=useState("");
 const [group,setGroup]=useState("All");
 const shown=useMemo(()=>REACH_FEATURES.filter(f=>(group==="All"||f.group===group)&&(f.title+" "+f.description+" "+f.detail).toLowerCase().includes(query.trim().toLowerCase())),[query,group]);
 return <section className="reach-directory" aria-label="REACH feature directory">
  <div className="reach-intro"><div><div className="ag-eyebrow">REACH / ALL FEATURES</div><h1>Everything in one place.</h1><p>Explore the full platform. Each feature shows whether it can be opened in staging or still needs implementation.</p></div><span className="reach-mode-tag">Owner-only workspace</span></div>
  <div className="reach-directory-tools"><label>Find a feature<input type="search" placeholder="Search features, services and tools" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Category<select value={group} onChange={e=>setGroup(e.target.value)}><option>All</option>{REACH_GROUPS.map(g=><option key={g}>{g}</option>)}</select></label></div>
  <div className="reach-status-key"><span><i className="reach-dot staging"/> Staging (sign-in or setup may be required)</span><span><i className="reach-dot source"/> Source only</span><span><i className="reach-dot planned"/> Planned / disabled</span></div>
  {REACH_GROUPS.filter(g=>group==="All"||group===g).map(g=>{
   const list=shown.filter(f=>f.group===g);
   return list.length?<section key={g} className="reach-directory-section"><div className="reach-section-head"><h2>{g}</h2><small>{list.length} features</small></div><div className="reach-feature-grid">{list.map(f=><article className="reach-feature" key={f.id}><span className="reach-feature-icon" aria-hidden="true">{f.icon}</span><div><div className="reach-feature-title"><h3>{f.title}</h3><span className={"reach-status "+f.status}>{featureLabel(f)}</span></div><p>{f.description}</p><small>{f.detail}</small></div>{featureOpenable(f)?<button className="reach-open" onClick={()=>onOpen(f)} aria-label={"Open "+f.title}>Open <span aria-hidden="true">↗</span></button>:<button className="reach-open disabled" disabled aria-label={f.title+" unavailable"}>Unavailable</button>}</article>)}</div></section>:null;
  })}
  {!shown.length&&<p className="reach-no-results">No matching features. Try another search or category.</p>}
  {recent.length>0&&<p className="reach-detail-foot">Recent tools are kept in this browser session only. Connection and customer data are not stored in UI preferences.</p>}
 </section>;
}
