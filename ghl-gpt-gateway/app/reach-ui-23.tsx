"use client";
import {useMemo,useState} from "react";

export type ReachScreen="overview"|"directory"|"clients"|"features"|"services"|"social"|"settings"|"discover"|"web"|"marketing";
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
 {id:"social",title:"Social Posting & Scheduling",group:"Social Media",description:"Internal drafts, approvals, content plans and calendar",status:"staging",screen:"social",detail:"Administrator-only; external publishing disabled",icon:"↗"},
 {id:"social-analytics",title:"Social Analytics",group:"Social Media",description:"Facebook and Instagram performance by page or profile",status:"staging",href:"/?social=metrics",detail:"Live Meta data when permissions allow",icon:"▤"},
 {id:"social-inbox",title:"Social Inbox",group:"Social Media",description:"Verified customer interaction metadata and approved replies",status:"staging",href:"/?social=inbox",detail:"Webhook setup required; no message bodies stored",icon:"✉"},
 {id:"social-connections",title:"Connections Center",group:"Platform",description:"Central business account connections and provider status",status:"staging",href:"/connections",detail:"Owner-authorized read-only provider connections; requires configured apps and storage",icon:"⛓"},
 {id:"social-calendar",title:"Social Calendar",group:"Social Media",description:"Review scheduled drafts and approved posts",status:"staging",href:"/?social=calendar",detail:"Owner approval and external delivery switches apply",icon:"▦"},
 {id:"social-comments",title:"Comments",group:"Social Media",description:"Review comments on connected profile posts",status:"staging",href:"/?social=comments",detail:"Read-only comment reader and local reply drafts",icon:"▧"},
 {id:"web-home",title:"Website Overview",group:"Web Design",description:"All website tools in one place",status:"staging",screen:"web",detail:"Website module readiness and shortcuts",icon:"⌂"},
 {id:"website",title:"Website Builder",group:"Web Design",description:"Visual website and landing-page building",status:"source",href:"/?view=web&tool=website",detail:"Source/runtime preparation only",icon:"⌂"},
 {id:"web-domains",title:"Domains & DNS",group:"Web Design",description:"Register domains, verify ownership and inspect DNS",status:"staging",href:"/connections#domains",detail:"Workspace domain registry and read-only DNS checks; no hosting changes",icon:"⛓"},
 {id:"web-analytics",title:"Website Analytics",group:"Web Design",description:"Traffic, visitors, pages and conversion measurement",status:"planned",href:"/?view=web&tool=web-analytics",detail:"Website analytics provider not yet connected",icon:"▤"},
 {id:"web-seo",title:"Website SEO & Health",group:"Web Design",description:"Search visibility, site performance and technical health",status:"planned",href:"/?view=web&tool=web-seo",detail:"Website monitoring not yet connected",icon:"◎"},
 {id:"web-publishing",title:"Hosting & Publishing",group:"Web Design",description:"Website previews, hosting and deployment",status:"planned",href:"/?view=web&tool=web-publishing",detail:"Website runtime not yet deployed",icon:"↗"},
 {id:"marketing-home",title:"Marketing Overview",group:"Marketing",description:"Lead generation, campaign planning and promotion",status:"staging",screen:"marketing",detail:"Marketing-specific tools and readiness",icon:"◈"},
 {id:"funnels",title:"Funnels & Forms",group:"Marketing",description:"Lead-generation landing pages and intake forms",status:"source",href:"/?view=marketing&tool=funnels",detail:"Module planning; no public intake enabled",icon:"◇"},
 {id:"social-ads",title:"Social Media Ads",group:"Marketing",description:"Paid Facebook and Instagram campaign planning, targeting and results",status:"planned",href:"/?view=marketing&tool=social-ads",detail:"Ads accounts and campaign management not yet connected",icon:"↗"},
 {id:"search-ads",title:"Search Ads",group:"Marketing",description:"Paid search campaign planning and conversions",status:"planned",href:"/?view=marketing&tool=search-ads",detail:"Ads provider not yet connected",icon:"◎"},
 {id:"email-campaigns",title:"Email & SMS Campaigns",group:"Marketing",description:"Promotional campaigns and lead nurturing",status:"planned",href:"/?view=marketing&tool=email-campaigns",detail:"Campaign delivery requires authorized providers",icon:"✉"},
 {id:"campaign-reporting",title:"Campaign Performance",group:"Marketing",description:"Leads, conversions, advertising spend and attribution",status:"planned",href:"/?view=marketing&tool=campaign-reporting",detail:"Campaign data sources not yet connected",icon:"▤"},
 {id:"reviews",title:"Reviews & Reputation",group:"Marketing",description:"Reviews, listings and business presence",status:"planned",href:"/?view=marketing&tool=reviews",detail:"No review-provider connection yet",icon:"★"},
 {id:"automations",title:"Automations",group:"Operations",description:"Visual rules, approvals and workflow history",status:"source",screen:"services",detail:"Reference engines only; outbound sends disabled",icon:"⚡"},
 {id:"tasks",title:"Tasks & Alerts",group:"Operations",description:"Prioritized to-dos, action center and reminders",status:"planned",detail:"No live task queue is represented",icon:"☷"},
 {id:"calendar",title:"Appointments",group:"Operations",description:"Bookings, appointments and staff availability",status:"source",screen:"services",detail:"Service groundwork only; no booking availability",icon:"◷"},
 {id:"courses",title:"Learning Studio",group:"Operations",description:"Online courses, lessons and student records",status:"source",screen:"services",detail:"Standalone engine/reference integration",icon:"▣"},
 {id:"ai",title:"AI Assistant",group:"Intelligence",description:"Dedicated assistant workspace and approved rules",status:"planned",detail:"Not connected to customer data or provider keys",icon:"✦"},
 {id:"insights",title:"Delivery Operations",group:"Operations",description:"Draft and dry-run delivery statistics",status:"staging",href:"/?social=insights",detail:"Internal statistics, not external engagement",icon:"▥"},
 {id:"reporting",title:"Business Analytics",group:"Intelligence",description:"Actual KPIs, trends and plain-language interpretation",status:"planned",detail:"Real customer KPIs not yet available",icon:"▤"},
 {id:"neon",title:"Neon Connections",group:"Platform",description:"Production database health and storage",status:"staging",href:"/connections#neon",detail:"Owner-only live Neon health and table storage; no database provisioning",icon:"⛁"},
 {id:"integrations",title:"Integration Catalog",group:"Platform",description:"Source/runtime integration and connection setup",status:"staging",screen:"services",detail:"Not all connectors are installed or authenticated",icon:"⛓"},
 {id:"features",title:"Module Governance",group:"Platform",description:"Feature permissions and preview requests",status:"staging",screen:"features",detail:"Requests are previews, not actual grants",icon:"▣"},
 {id:"settings",title:"Owner Settings",group:"Platform",description:"Administrator access and setup requirements",status:"staging",screen:"settings",detail:"Single owner; no client logins",icon:"⚙"},
 {id:"migration",title:"GHL Migration",group:"Platform",description:"Controlled import after independent features pass",status:"disabled",screen:"discover",detail:"Deferred; no scanning, import or writes enabled",icon:"⇥"}
];
export const REACH_GROUPS=["Workspace","Customers","Social Media","Web Design","Marketing","Operations","Intelligence","Platform"] as const;
export function featureHref(f:ReachFeature):string|null{
 if(!featureOpenable(f))return null;
 return f.href||(f.screen?f.screen==="overview"?"/":f.screen==="social"?"/?social=posting":"/?view="+f.screen:null);
}
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
