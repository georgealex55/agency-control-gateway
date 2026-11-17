"use client";
import {useEffect,useState} from "react";
import {REACH_FEATURES,type ReachFeature} from "./reach-ui-23";
import {DEFAULT_COMMAND_LAYOUT,normalizeCommandLayout,parseCommandLayout,type CommandLayout,type CommandWidgetId} from "@/lib/reach-command-contract";
import {CommandDataError,commandErrorInfo,loadCommandJson,parseCommandReadiness,parseCommandWorkspaces,parseCommandInsights,parseCommandMonitor,parseCommandProviders,type CommandWorkspace,type CommandInsights,type CommandMonitor,type CommandProviders} from "@/lib/reach-command-data";

type Workspace=CommandWorkspace;
type Insights=CommandInsights;
type Monitor=CommandMonitor;
type Providers=CommandProviders;
type LayoutResponse={workspaceId:string;layout:CommandLayout;revision:number;saveEnabled:boolean};
type Feed="insights"|"monitor"|"providers";
type FeedError={message:string;action:"sign_in"|"retry"|"configure"|"select_workspace"};
const titles:Record<CommandWidgetId,string>={
 readiness:"Workspace & system readiness",social:"Social content",connections:"Provider readiness",
 delivery:"Dry-run delivery monitoring",actions:"Priority action center",shortcuts:"Quick actions",roadmap:"Feature roadmap"
};
const number=(n:number|undefined)=>typeof n==="number"&&Number.isFinite(n)?n.toLocaleString():"—";
const statusDetail=(status:string)=>status==="read_only"?"Read-only record":status==="authorization_pending"?"Consent pending":status==="missing_config"?"Setup required":status==="expired"?"Expired":status==="revoked"?"Revoked":status==="error"?"Error":"Disconnected";
function parseLayoutResponse(raw:unknown,workspaceId:string):LayoutResponse{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new CommandDataError(422,"Invalid layout response");
 const value=raw as Record<string,unknown>;
 const layout=parseCommandLayout(value.layout);
 if(value.workspaceId!==workspaceId||!layout||typeof value.revision!=="number"||!Number.isSafeInteger(value.revision)||value.revision<0||
 (value.saveEnabled!==true&&value.saveEnabled!==false))throw new CommandDataError(422,"Invalid workspace layout response");
 return {workspaceId,layout,revision:value.revision,saveEnabled:value.saveEnabled};
}
type Props={onOpen:(f:ReachFeature)=>void;recent:string[];authenticated:boolean;configured:boolean;onUnauthorized:()=>void};
export default function ReachCommandCenter({onOpen,recent,authenticated,configured,onUnauthorized}:Props){
 const [workspaces,setWorkspaces]=useState<Workspace[]>([]);
 const [workspaceId,setWorkspaceId]=useState("");
 const [workspaceError,setWorkspaceError]=useState("");
 const [workspaceLoading,setWorkspaceLoading]=useState(false);
 const [workspaceReload,setWorkspaceReload]=useState(0);
 const [refreshKey,setRefreshKey]=useState(0);
 const [insights,setInsights]=useState<Insights|null>(null);
 const [monitor,setMonitor]=useState<Monitor|null>(null);
 const [providers,setProviders]=useState<Providers|null>(null);
 const [feedErrors,setFeedErrors]=useState<Partial<Record<Feed,FeedError>>>({});
 const [feedsLoading,setFeedsLoading]=useState(false);
 const [layout,setLayout]=useState<CommandLayout>(()=>normalizeCommandLayout(DEFAULT_COMMAND_LAYOUT));
 const [layoutSaving,setLayoutSaving]=useState(false);
 const [layoutLoading,setLayoutLoading]=useState(false);
 const [layoutRevision,setLayoutRevision]=useState(0);
 const [layoutReload,setLayoutReload]=useState(0);
 const [saveEnabled,setSaveEnabled]=useState(false);
 const [layoutNotice,setLayoutNotice]=useState("Layout changes are local to this session.");
 const [edit,setEdit]=useState(false);
 const selected=workspaces.find(w=>w.id===workspaceId);
 const open=(id:string)=>{
  const item=REACH_FEATURES.find(f=>f.id===id);
  if(item)onOpen(item);
 };
 const failure=(e:unknown):FeedError=>{
  if(e instanceof CommandDataError&&e.status===401)onUnauthorized();
  return commandErrorInfo(e);
 };
 const describe=(e:unknown)=>failure(e).message;
 useEffect(()=>{
  if(!authenticated){setWorkspaces([]);setWorkspaceId("");setWorkspaceError("");return;}
  const controller=new AbortController();setWorkspaceLoading(true);
  // Never query the potentially global platform DB until isolated-preview approval is verified.
  loadCommandJson("/api/platform/command-center/readiness",controller.signal,parseCommandReadiness)
   .then(()=>loadCommandJson("/api/platform/workspaces",controller.signal,parseCommandWorkspaces))
   .then(list=>{
    if(controller.signal.aborted)return;
    setWorkspaces(list);
    setWorkspaceId(old=>list.some(w=>w.id===old)?old:list[0]?.id||"");
    setWorkspaceError("");
   })
   .catch(e=>{if(!controller.signal.aborted){setWorkspaceError(describe(e));setWorkspaces([]);setWorkspaceId("");}})
   .finally(()=>{if(!controller.signal.aborted)setWorkspaceLoading(false);});
  return ()=>controller.abort();
 },[authenticated,workspaceReload]);
 useEffect(()=>{
  setInsights(null);setMonitor(null);setProviders(null);setFeedErrors({});
  setFeedsLoading(false);
  if(!authenticated||!workspaceId)return;
  const controller=new AbortController();
  const query="?workspaceId="+encodeURIComponent(workspaceId);
  setFeedsLoading(true);
  // Each data source fails independently. Invalid or cross-workspace JSON never becomes a metric.
  Promise.all([
   loadCommandJson("/api/platform/social/insights"+query,controller.signal,raw=>parseCommandInsights(raw,workspaceId))
    .then(value=>{if(!controller.signal.aborted)setInsights(value);})
    .catch(e=>{if(!controller.signal.aborted)setFeedErrors(p=>({...p,insights:failure(e)}));}),
   loadCommandJson("/api/platform/social/monitor"+query,controller.signal,raw=>parseCommandMonitor(raw,workspaceId))
    .then(value=>{if(!controller.signal.aborted)setMonitor(value);})
    .catch(e=>{if(!controller.signal.aborted)setFeedErrors(p=>({...p,monitor:failure(e)}));}),
   loadCommandJson("/api/platform/social/providers"+query,controller.signal,raw=>parseCommandProviders(raw,workspaceId))
    .then(value=>{if(!controller.signal.aborted)setProviders(value);})
    .catch(e=>{if(!controller.signal.aborted)setFeedErrors(p=>({...p,providers:failure(e)}));})
  ]).finally(()=>{if(!controller.signal.aborted)setFeedsLoading(false);});
  return ()=>controller.abort();
 },[workspaceId,authenticated,refreshKey]);
 useEffect(()=>{
  setLayout(normalizeCommandLayout(DEFAULT_COMMAND_LAYOUT));setLayoutRevision(0);setSaveEnabled(false);
  setLayoutNotice("Loading saved layout or using session defaults…");
  if(!authenticated||!workspaceId){setLayoutLoading(false);setLayoutNotice("Select an authorized staging workspace to save layouts.");return;}
  const controller=new AbortController();
  const query="?workspaceId="+encodeURIComponent(workspaceId);
  setLayoutLoading(true);
  loadCommandJson("/api/platform/command-center/layout"+query,controller.signal,raw=>parseLayoutResponse(raw,workspaceId))
   .then(value=>{
    if(controller.signal.aborted)return;
    setLayout(value.layout);setLayoutRevision(value.revision);
    setSaveEnabled(value.saveEnabled);
    setLayoutNotice(value.saveEnabled?"Layout loaded; changes can be saved for this staging workspace.":"Layout saving is disabled in this preview; changes stay in this session.");
   }).catch(e=>{if(!controller.signal.aborted)setLayoutNotice(describe(e)+" Layout editing remains session-only.");})
   .finally(()=>{if(!controller.signal.aborted)setLayoutLoading(false);});
  return ()=>controller.abort();
 },[workspaceId,authenticated,layoutReload]);
 const mutate=(update:(old:CommandLayout)=>CommandLayout)=>{
  if(layoutSaving||layoutLoading)return;
  setLayout(old=>update(old));setLayoutNotice(saveEnabled?"Unsaved layout changes.":"Session-only layout changes; server saving is disabled.");
 };
 function shift(id:CommandWidgetId,delta:number){mutate(old=>{
  const order=[...old.order],from=order.indexOf(id),to=from+delta;
  if(from<0||to<0||to>=order.length)return old;
  [order[from],order[to]]=[order[to],order[from]];
  return {...old,order};
 });}
 function toggle(id:CommandWidgetId,key:"hidden"|"wide"){mutate(old=>({...old,[key]:old[key].includes(id)?old[key].filter(x=>x!==id):[...old[key],id]}));}
 async function saveLayout(){
  if(!authenticated||!workspaceId||!saveEnabled||layoutSaving||layoutLoading)return;
  setLayoutSaving(true);setLayoutNotice("Saving layout…");
  try{
   const response=await fetch("/api/platform/command-center/layout?workspaceId="+encodeURIComponent(workspaceId),{
    method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({layout,expectedRevision:layoutRevision})
   });
   if(!response.ok){
    if(response.status===409){setSaveEnabled(false);setLayoutNotice("Another session changed this layout. Reload the saved layout to resolve the conflict.");return;}
    throw new CommandDataError(response.status,"Layout saving declined");
   }
   const json=await response.json();
   const result=parseLayoutResponse(json,workspaceId);
   setLayoutRevision(result.revision);setLayoutNotice("Saved securely for this staging workspace.");
  }catch(e){setLayoutNotice(describe(e));}
  finally{setLayoutSaving(false);}
 }
 const alerts:{title:string;detail:string;feature:string}[]=[];
 if(monitor&&monitor.summary.attention>0)alerts.push({title:monitor.summary.attention+" delivery item(s) need review",detail:"Internal dry-run processing needs attention; no automated resend.",feature:"social"});
 if(insights&&insights.overdueApproved>0)alerts.push({title:insights.overdueApproved+" overdue approved plan(s)",detail:"Review staged planning dates in Social Studio.",feature:"social-calendar"});
 if(providers){const missing=providers.connections.filter(p=>p.connectionStatus==="missing_config").length;if(missing>0)alerts.push({title:missing+" social provider(s) need configuration",detail:"Developer consent and setup are not complete.",feature:"social-connections"});}
 const statusFeed=(kind:Feed)=>{
  const available=kind==="insights"?insights:kind==="monitor"?monitor:providers;
  return <div className="reach-feed-meta" role="status">
   <span>{feedErrors[kind]?"Unavailable: "+feedErrors[kind]?.message:feedsLoading?"Loading authorized staging data…":available?"Verified staging response":"No verified data loaded"}</span>
   {feedErrors[kind]&&<button className="reach-inline-link" onClick={()=>{
    const action=feedErrors[kind]?.action;
    if(action==="sign_in")open("workspaces");
    else if(action==="configure")open("settings");
    else if(action==="select_workspace")setWorkspaceReload(n=>n+1);
    else setRefreshKey(n=>n+1);
   }}>{feedErrors[kind]?.action==="sign_in"?"Sign in":feedErrors[kind]?.action==="configure"?"Review setup":feedErrors[kind]?.action==="select_workspace"?"Choose workspace":"Retry data"} ↗</button>}
  </div>;
 };
 return <div className="reach-command">
  <div className="reach-intro reach-hero"><div>
   <div className="ag-eyebrow">REACH 2.3 / OWNER COMMAND CENTER</div><h1>One workspace. Clear priorities.</h1>
   <p>Real staging workspace counts when accessible; no guessed revenue, contact totals, connected accounts or external analytics.</p>
   <div className="reach-hero-actions"><button className="ag-primary" onClick={()=>open("directory")}>Explore all features ↗</button><button className="ag-secondary" onClick={()=>open("social")}>Open Social Studio</button></div>
  </div><div className="reach-hero-art" aria-hidden="true"><span className="reach-orbit r1"/><span className="reach-orbit r2"/><b>R<span>•</span></b></div></div>
  <section className="reach-command-toolbar" aria-label="Command Center workspace controls">
   <label>Selected workspace<select value={workspaceId} disabled={!authenticated||workspaceLoading||layoutSaving||layoutLoading} onChange={e=>setWorkspaceId(e.target.value)}><option value="">{workspaceLoading?"Loading workspaces…":"Select a workspace"}</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
   <div><span className="reach-mode-tag">{authenticated?"Owner session":"Sign-in required"}</span><button className="ag-secondary" disabled={!workspaceId||feedsLoading} onClick={()=>setRefreshKey(n=>n+1)}>Refresh data</button></div>
  </section>
  {!authenticated&&<section className="reach-dashboard-notice" role="status"><strong>{configured?"Owner sign-in required":"Owner access must be configured"}</strong><p>Sign in through an existing protected REACH workspace to load internal business data. No customer information appears before authorization.</p><button className="ag-secondary" onClick={()=>open("workspaces")}>Open administrator sign-in</button></section>}
  {authenticated&&workspaceError&&<p className="reach-dashboard-notice" role="alert">Workspace loading failed: {workspaceError} <button className="ag-secondary" onClick={()=>setWorkspaceReload(n=>n+1)}>Retry workspaces</button> <button className="ag-secondary" onClick={()=>open("settings")}>Review owner setup</button></p>}
  {authenticated&&!workspaceLoading&&!workspaceError&&!workspaces.length&&<section className="reach-dashboard-notice"><strong>No platform workspaces available</strong><p>Create an isolated staging workspace first. Dashboard metrics are unavailable until a workspace exists.</p><button className="ag-secondary" onClick={()=>open("workspaces")}>Manage workspaces</button></section>}
  <div className="reach-dashboard-bar"><div><strong>{selected?selected.name+" · owner dashboard":"Owner overview"}</strong><p>{selected?"Workspace-scoped data and optional saved layout":"Select an authorized workspace to see verified staging records."}</p></div><div><button className="ag-secondary" onClick={()=>setEdit(v=>!v)} aria-pressed={edit}>{edit?"Finish customizing":"Customize layout"}</button>{edit&&<><button className="ag-primary" disabled={!workspaceId||!saveEnabled||layoutSaving||layoutLoading} onClick={()=>void saveLayout()}>{layoutSaving?"Saving…":"Save layout"}</button><button className="ag-secondary" disabled={!workspaceId||layoutSaving||layoutLoading} onClick={()=>setLayoutReload(n=>n+1)}>Reload saved layout</button></>}</div></div>
  <p className="reach-layout-notice" role="status">{layoutNotice}</p>
  <div className="reach-dashboard-metrics" aria-label="Verified internal workspace KPIs">
   <div><span>Internal social drafts</span><strong>{number(insights?.drafts.draft)}</strong><small>{insights?"Staging only":"No verified data"}</small></div>
   <div><span>Plans, next seven days</span><strong>{number(insights?.scheduledNextSevenDays)}</strong><small>{insights?"Internal schedule, not published":"No verified data"}</small></div>
   <div><span>Approved internal posts</span><strong>{number(insights?.drafts.approved)}</strong><small>{insights?"Not external deliveries":"No verified data"}</small></div>
   <div><span>Dry-run attention items</span><strong>{number(monitor?.summary.attention)}</strong><small>{monitor?"Not live delivery":"No verified data"}</small></div>
  </div>
  <div className="reach-bento-grid">
  {layout.order.filter(id=>!layout.hidden.includes(id)).map(id=><section key={id} className={"reach-widget "+(layout.wide.includes(id)?"wide":"")} aria-label={titles[id]}>
   <div className="reach-widget-head"><h2>{titles[id]}</h2>{edit&&<div className="reach-widget-actions">
    <button disabled={layoutSaving||layoutLoading} aria-label={"Move "+titles[id]+" earlier"} onClick={()=>shift(id,-1)}>↑</button>
    <button disabled={layoutSaving||layoutLoading} aria-label={"Move "+titles[id]+" later"} onClick={()=>shift(id,1)}>↓</button>
    <button disabled={layoutSaving||layoutLoading} aria-label={"Resize "+titles[id]} onClick={()=>toggle(id,"wide")}>⇲</button>
    <button disabled={layoutSaving||layoutLoading} aria-label={"Hide "+titles[id]} onClick={()=>toggle(id,"hidden")}>×</button>
   </div>}</div>
   {id==="readiness"&&<div className="reach-readiness"><div><span className="reach-readiness-symbol">◎</span><strong>{authenticated?"Owner session active":configured?"Sign-in required":"Admin setup required"}</strong><p>Workspace: {selected?selected.name:"Not selected"}. Platform storage: {workspaceError?"Unavailable":selected?"Workspace inventory returned":"Not verified"}. Social provider configuration must be checked separately.</p></div><button className="reach-inline-link" onClick={()=>open(authenticated?"workspaces":"settings")}>Open {authenticated?"workspaces":"settings"} →</button></div>}
   {id==="social"&&<div className="reach-command-data">{statusFeed("insights")}{insights?<><div className="reach-data-row"><span>Draft</span><b>{number(insights.drafts.draft)}</b></div><div className="reach-data-row"><span>Planned</span><b>{number(insights.drafts.planned)}</b></div><div className="reach-data-row"><span>Approved internally</span><b>{number(insights.drafts.approved)}</b></div><div className="reach-data-row"><span>Upcoming seven days</span><b>{number(insights.scheduledNextSevenDays)}</b></div></>:<p>Internal content data is not available for this workspace.</p>}<p className="reach-widget-disclaimer">External reach, revenue and engagement metrics are not collected here.</p><button className="reach-inline-link" onClick={()=>open("insights")}>Open internal insights →</button></div>}
   {id==="connections"&&<div className="reach-command-data">{statusFeed("providers")}{providers?<><p>{providers.connections.length} provider entries reported for the selected workspace. State does not prove live consent.</p><div className="reach-provider-list">{providers.connections.map(p=><div key={p.id}><span>{p.name}</span><b>{statusDetail(p.connectionStatus)}</b></div>)}</div></>:<p>Provider readiness has not been verified for this workspace.</p>}<button className="reach-inline-link" onClick={()=>open("social-connections")}>Review Social Connections →</button></div>}
   {id==="delivery"&&<div className="reach-command-data">{statusFeed("monitor")}{monitor?<><div className="reach-data-row"><span>Needs manual review</span><b>{number(monitor.summary.attention)}</b></div><div className="reach-data-row"><span>Retry exhausted</span><b>{number(monitor.summary.retryExhausted)}</b></div><div className="reach-data-row"><span>Queued over one hour</span><b>{number(monitor.summary.queuedOverHour)}</b></div><div className="reach-data-row"><span>Stale revision</span><b>{number(monitor.summary.outdatedRevision)}</b></div></>:<p>Delivery monitoring is unavailable. No job status is inferred.</p>}<p className="reach-widget-disclaimer">Internal synthetic delivery only. External publishing remains disabled.</p><button className="reach-inline-link" onClick={()=>open("social")}>Open Social Studio →</button></div>}
   {id==="actions"&&<div className="reach-task-list">
    {!selected?<div><span className="reach-task-number">01</span><div><strong>Select a staging workspace</strong><p>Data and attention items are workspace-specific.</p></div><button onClick={()=>open("workspaces")}>Open</button></div>:
    <>{alerts.map((a,i)=><div key={a.title}><span className="reach-task-number">{String(i+1).padStart(2,"0")}</span><div><strong>{a.title}</strong><p>{a.detail}</p></div><button onClick={()=>open(a.feature)}>Review</button></div>)}
     {!alerts.length&&<div><span className="reach-task-number">✓</span><div><strong>{insights&&monitor&&providers?"No attention items returned":"Action data incomplete"}</strong><p>{insights&&monitor&&providers?"Current internal staging responses contain no flagged items.":"Some sources are unavailable; this is not an all-clear."}</p></div></div>}
    </>}
    <div><span className="reach-task-number">•</span><div><strong>Live publishing remains disabled</strong><p>Review only internal drafts and provider setup.</p></div><span className="reach-lock">Locked</span></div>
   </div>}
   {id==="shortcuts"&&<div className="reach-shortcuts">{["social","social-calendar","social-connections","workspaces","neon","features"].map(v=>{const f=REACH_FEATURES.find(x=>x.id===v)!;return <button key={v} onClick={()=>onOpen(f)}><span aria-hidden="true">{f.icon}</span><strong>{v==="social"?"New social draft":f.title}</strong><small>{v==="social"?"Open internal composer":"Open staging tool"}</small></button>;})}<button disabled title="Requires verified owner data access"><span aria-hidden="true">◎</span><strong>Add contact</strong><small>Not enabled</small></button><button disabled title="No external communication is enabled"><span aria-hidden="true">✉</span><strong>Send message</strong><small>Not enabled</small></button></div>}
   {id==="roadmap"&&<div className="reach-roadmap"><p>Operational modules, source integrations and upcoming features are all visible. Planned actions remain disabled until implemented and verified.</p><div>{["CRM","Calls","Messaging","Social","Automations","Analytics","AI"].map(x=><span key={x}>{x}</span>)}</div><button className="reach-inline-link" onClick={()=>open("directory")}>Browse all capabilities →</button></div>}
  </section>)}
  </div>
  {layout.hidden.length>0&&<button className="ag-secondary" onClick={()=>mutate(old=>({...old,hidden:[]}))}>Restore hidden widgets ({layout.hidden.length})</button>}
  {edit&&<button className="ag-secondary" onClick={()=>mutate(()=>normalizeCommandLayout(DEFAULT_COMMAND_LAYOUT))}>Reset to default layout</button>}
  {recent.length>0&&<div className="reach-recent"><b>Recently opened</b>{recent.map(id=>{const f=REACH_FEATURES.find(x=>x.id===id);return f?<button key={id} onClick={()=>onOpen(f)}>{f.title} ↗</button>:null;})}</div>}
 </div>;
}
