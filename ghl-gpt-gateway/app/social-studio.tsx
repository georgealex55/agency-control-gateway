"use client";
import {useEffect,useState,type FormEvent} from "react";
import {SOCIAL_CHANNELS,type SocialChannel,type SocialState} from "@/lib/social-contract";
type Post={id:string;workspaceId:string;content:string;state:SocialState;channels:string[];scheduledAt:string|null;createdAt:string};
type Workspace={id:string;name:string;slug:string};
type DispatchJob={id:string;postId:string;channel:string;status:string;attempts:number;nextAttemptAt:string|null;lastErrorCode:string|null;createdAt:string;completedAt:string|null};
type MediaAsset={id:string;workspaceId:string;name:string;mime:string;size:number;createdAt:string};
type MetaReadiness={provider:"facebook_pages"|"instagram_professional";appConfigured:boolean;permissions:string[];connected:false;launchEnabled:false;};
type ProviderReadiness={id:string;name:string;auth:string;accounts:string;scopes:string[];publishScopes:string[];appSetup:string;connectionStatus:"not_connected";oauthEnabled:false;publishingEnabled:false;};
type InternalInsights={drafts:Record<SocialState,number>;dispatch:Record<"pending"|"queued"|"simulated"|"canceled",number>;retryExhausted:number;scheduledNextSevenDays:number;overdueApproved:number;channelPlans:{channel:string;count:number}[];externalReach:null;externalEngagement:null;metricsAvailable:false;};
const networkNames:Record<string,string>={instagram:"Instagram",facebook:"Facebook",linkedin:"LinkedIn",threads:"Threads",tiktok:"TikTok",youtube:"YouTube",x:"X",pinterest:"Pinterest"};
function localDate(offset:number){const d=new Date(Date.now()+offset*60000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function dateHuman(value:string|null){return value?new Date(value).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"Unscheduled";}
export default function SocialStudio(){
 const [workspaces,setWorkspaces]=useState<Workspace[]>([]);
 const [workspaceId,setWorkspaceId]=useState("");
 const [posts,setPosts]=useState<Post[]>([]);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [content,setContent]=useState("");
 const [state,setState]=useState<SocialState>("draft");
 const [schedule,setSchedule]=useState(localDate(60));
 const [channels,setChannels]=useState<SocialChannel[]>([]);
 const [editing,setEditing]=useState<string|null>(null);
 const [jobs,setJobs]=useState<DispatchJob[]>([]);
 const [internalInsights,setInternalInsights]=useState<InternalInsights|null>(null);
 const [providers,setProviders]=useState<ProviderReadiness[]>([]);
 const [metaReadiness,setMetaReadiness]=useState<MetaReadiness[]>([]);
 const [mediaAssets,setMediaAssets]=useState<MediaAsset[]>([]);
 const [mediaUploads,setMediaUploads]=useState(false);
 const [mediaStorageConnected,setMediaStorageConnected]=useState(false);
 const [mediaStorageMode,setMediaStorageMode]=useState("none");
 const [selectedMedia,setSelectedMedia]=useState<File|null>(null);
 const [mediaStatus,setMediaStatus]=useState("");
 const [dispatchNote,setDispatchNote]=useState("Nothing has been dispatched in staging.");
 const [tab,setTab]=useState<"composer"|"calendar"|"insights"|"metrics"|"providers"|"media">("composer");
 useEffect(()=>{
  fetch("/api/platform/workspaces",{credentials:"same-origin",cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||"Workspaces unavailable");return j;}).then(j=>{const list=Array.isArray(j.workspaces)?j.workspaces:[];setWorkspaces(list);setWorkspaceId(list[0]?.id||"");}).catch(e=>setMessage(e.message)).finally(()=>setLoading(false));
 },[]);
 useEffect(()=>{if(workspaceId){setSelectedMedia(null);void refresh(workspaceId);void refreshJobs(workspaceId);void refreshInsights(workspaceId);void refreshProviders(workspaceId);void refreshMedia(workspaceId);void refreshMeta(workspaceId);}else {setPosts([]);setJobs([]);setInternalInsights(null);setProviders([]);setMediaAssets([]);setMetaReadiness([]);}},[workspaceId]);
 async function refresh(id=workspaceId){
  if(!id)return;
  try{
   const r=await fetch("/api/platform/social?workspaceId="+encodeURIComponent(id),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Social drafts unavailable");setPosts(Array.isArray(j.posts)?j.posts:[]);
  }catch(e){setMessage(e instanceof Error?e.message:"Could not load social drafts");}
 }
 function reset(){setEditing(null);setContent("");setState("draft");setChannels([]);setSchedule(localDate(60));}
 function edit(p:Post){setEditing(p.id);setContent(p.content);setState(p.state);setChannels(p.channels as SocialChannel[]);setSchedule(p.scheduledAt?new Date(new Date(p.scheduledAt).getTime()-new Date(p.scheduledAt).getTimezoneOffset()*60000).toISOString().slice(0,16):localDate(60));setTab("composer");}
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!workspaceId)return;
  setBusy(true);setMessage("");
  try{
   const scheduledAt=state==="draft"?(schedule?new Date(schedule).toISOString():null):new Date(schedule).toISOString();
   const r=await fetch(editing?"/api/platform/social/"+encodeURIComponent(editing):"/api/platform/social",{
    method:editing?"PUT":"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",
    body:JSON.stringify({workspaceId,content,state,channels,scheduledAt})
   });
   const j=await r.json();if(!r.ok)throw Error(j.error||"Could not save content");
   await refresh();reset();setMessage("Saved in staging. Nothing was published or sent.");
  }catch(e){setMessage(e instanceof Error?e.message:"Save failed");}
  finally{setBusy(false);}
 }
 async function remove(id:string){
  if(!workspaceId)return;setBusy(true);setMessage("");
  try{const r=await fetch("/api/platform/social/"+encodeURIComponent(id)+"?workspaceId="+encodeURIComponent(workspaceId),{method:"DELETE",credentials:"same-origin"});
  const j=await r.json();if(!r.ok)throw Error(j.error||"Unable to delete draft");await refresh();if(editing===id)reset();setMessage("Draft removed from staging.");}
  catch(e){setMessage(e instanceof Error?e.message:"Delete failed");}finally{setBusy(false);}
 }
 async function refreshJobs(id=workspaceId){
  if(!id)return;
  try{
   const r=await fetch("/api/platform/social/jobs?workspaceId="+encodeURIComponent(id),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Delivery ledger unavailable");setJobs(Array.isArray(j.jobs)?j.jobs:[]);
  }catch(e){setDispatchNote(e instanceof Error?e.message:"Delivery ledger unavailable");}
 }
 async function refreshInsights(id=workspaceId){
  if(!id)return;
  try{
   const r=await fetch("/api/platform/social/insights?workspaceId="+encodeURIComponent(id),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Internal insights unavailable");setInternalInsights(j as InternalInsights);
  }catch(e){setDispatchNote(e instanceof Error?e.message:"Internal insights unavailable");}
 }
 async function refreshProviders(id=workspaceId){
  if(!id)return;
  try{
   const r=await fetch("/api/platform/social/providers?workspaceId="+encodeURIComponent(id),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Provider readiness unavailable");setProviders(Array.isArray(j.connections)?j.connections:[]);
  }catch(e){setDispatchNote(e instanceof Error?e.message:"Provider readiness unavailable");}
 }
 async function refreshMedia(id=workspaceId){
  if(!id)return;
  try{
   const r=await fetch("/api/platform/social/media?workspaceId="+encodeURIComponent(id),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Media library unavailable");
   setMediaAssets(Array.isArray(j.media)?j.media:[]);setMediaUploads(j.uploadsEnabled===true);setMediaStorageConnected(j.storageConnected===true);setMediaStorageMode(j.storageMode||"none");
  }catch(e){setMediaStatus(e instanceof Error?e.message:"Media library unavailable");}
 }
 async function refreshMeta(id=workspaceId){
  if(!id)return;
  try{
   const r=await fetch("/api/platform/social/meta/readiness?workspaceId="+encodeURIComponent(id),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Meta readiness unavailable");
   setMetaReadiness(Array.isArray(j.connections)?j.connections:[]);
  }catch(e){setMediaStatus(e instanceof Error?e.message:"Meta readiness unavailable");}
 }
 async function uploadMedia(){
  if(!selectedMedia||!workspaceId)return;setBusy(true);setMediaStatus("");
  try{
   const body=new FormData();body.set("workspaceId",workspaceId);body.set("file",selectedMedia);
   const r=await fetch("/api/platform/social/media",{method:"POST",body,credentials:"same-origin"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Private image upload failed");
   setSelectedMedia(null);setMediaStatus("Image saved privately in staging; it has not been published.");
   await refreshMedia();
  }catch(e){setMediaStatus(e instanceof Error?e.message:"Private upload unavailable");}
  finally{setBusy(false);}
 }
 async function dryRun(){
  if(!workspaceId)return;setBusy(true);setDispatchNote("Preparing due approved posts…");
  try{
   const r=await fetch("/api/platform/social/dispatch",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({workspaceId})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Queue not available");
   setDispatchNote("Submitted "+j.submitted+" jobs to Vercel Queues, "+j.failed+" failed, "+j.exhaustedRetries+" exhausted retries. "+(j.submitted===0?"Only approved content with a past-due date is eligible.":"Delivery is simulated, not published."));
   await refreshJobs();await refreshInsights();
  }catch(e){setDispatchNote(e instanceof Error?e.message:"Queue not available");}
  finally{setBusy(false);}
 }
 const selected=workspaces.find(w=>w.id===workspaceId);
 const counts={draft:posts.filter(p=>p.state==="draft").length,planned:posts.filter(p=>p.state==="planned").length,approved:posts.filter(p=>p.state==="approved").length};
 return <div className="ag-social-root">
  <div className="ag-social-top"><div><div className="ag-eyebrow">SOCIAL INTELLIGENCE · ISOLATED STAGING</div><h1>Build better social content.</h1><p>Draft, approve and simulate scheduled content using Vercel Queues and Neon.</p></div><span className="ag-social-safe">● No publishing enabled</span></div>
  <div className="ag-social-toolbar"><label htmlFor="social-workspace">Workspace</label><select id="social-workspace" value={workspaceId} onChange={e=>{setWorkspaceId(e.target.value);reset();}} disabled={busy||loading}>{workspaces.length===0?<option value="">No workspaces created</option>:workspaces.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</select><span className="ag-social-workspace">{selected?.slug||"Staging setup"}</span><button className="ag-secondary" disabled={busy||!workspaceId} onClick={()=>void refresh()}>Refresh</button></div>
  {message&&<p className="ag-ws-note" role="status">{message}</p>}
  {!workspaceId?<section className="ag-card"><h2>No client workspace exists yet</h2><p>Create a synthetic workspace using the Workspaces menu. Social content will be stored there, not in a GHL account.</p></section>:<>
   <div className="ag-social-stats">{[["Draft content",counts.draft,"Edit anytime"],["Planned posts",counts.planned,"Not queued to publish"],["Approved internally",counts.approved,"Not sent"],["Dry-run deliveries",jobs.filter(j=>j.status==="simulated").length,"No external sends"]].map(([label,count,sub])=><div className="ag-metric" key={String(label)}><div><span>{label}</span><i>◈</i></div><strong>{count}</strong><small>{sub}</small></div>)}</div>
   <div className="ag-social-tabs">{[["composer","Content Studio"],["calendar","Publishing Calendar"],["insights","Delivery Operations"],["metrics","Internal Insights"],["providers","Social Connections"],["media","Media Library"]].map(([key,label])=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key as typeof tab)}>{label}</button>)}</div>
   {tab==="composer"&&<div className="ag-social-columns"><section className="ag-card"><h2>{editing?"Edit content":"Create content"}</h2><p>Draft and plan content without connecting a social account.</p>
    <form onSubmit={save} className="ag-social-form"><label>Post content<textarea rows={7} maxLength={3000} required value={content} onChange={e=>setContent(e.target.value)} placeholder="Write a post or start with a clear campaign idea…"/></label><div className="ag-social-count">{content.length}/3000</div><label>Stage<select value={state} onChange={e=>setState(e.target.value as SocialState)}><option value="draft">Draft</option><option value="planned">Planned (not published)</option><option value="approved">Approved for later integration</option></select></label><label>Target date (local time)<input type="datetime-local" value={schedule} onChange={e=>setSchedule(e.target.value)}/></label><fieldset><legend>Channel targets (planning only)</legend><div className="ag-social-channels">{SOCIAL_CHANNELS.map(c=><label key={c}><input type="checkbox" checked={channels.includes(c)} onChange={e=>setChannels(v=>e.target.checked?[...v,c]:v.filter(x=>x!==c))}/>{networkNames[c]}</label>)}</div></fieldset><div className="ag-social-actions"><button className="ag-primary" disabled={busy||!content.trim()}>{busy?"Saving…":editing?"Save changes":"Save in staging"}</button>{editing&&<button type="button" className="ag-secondary" onClick={reset}>Cancel edit</button>}</div></form></section>
   <section className="ag-card"><h2>Content library</h2><p>Everything here remains inside staging.</p><div className="ag-social-list">{posts.length===0?<div className="ag-social-empty">No content yet. Draft your first social post.</div>:posts.map(p=><article key={p.id} className="ag-social-post"><div className="ag-social-post-meta"><span className={"ag-social-post-badge "+p.state}>{p.state}</span><span>{dateHuman(p.scheduledAt)}</span></div><p>{p.content}</p><div className="ag-social-targets">{p.channels.map(c=><span key={c}>{networkNames[c]||c}</span>)}</div><div className="ag-social-actions"><button className="ag-secondary" disabled={busy} onClick={()=>edit(p)}>Edit</button><button className="ag-secondary" disabled={busy} onClick={()=>void remove(p.id)}>Delete</button></div></article>)}</div></section></div>}
   {tab==="calendar"&&<section className="ag-card"><h2>Content planning timeline</h2><p>These are internal scheduling intentions. No job runs and no social network receives a post.</p><div className="ag-social-list">{posts.filter(x=>x.scheduledAt).sort((a,b)=>Date.parse(a.scheduledAt!)-Date.parse(b.scheduledAt!)).map(p=><div className="ag-social-calendar" key={p.id}><div><b>{dateHuman(p.scheduledAt)}</b><small>{p.state.toUpperCase()}</small></div><div><p>{p.content}</p><small>{p.channels.map(x=>networkNames[x]||x).join(", ")||"No channel selected"}</small></div><button className="ag-secondary" onClick={()=>edit(p)}>Edit</button></div>)}{!posts.some(p=>p.scheduledAt)&&<div className="ag-social-empty">No posts scheduled for planning yet.</div>}</div></section>}
   {tab==="insights"&&<section className="ag-card">
    <div className="ag-platform-bar"><div><h2>Vercel-native delivery simulator</h2><p>Approved due posts are dispatched to Vercel Queues, but the private worker only records simulated delivery in Neon.</p></div>
      <button className="ag-primary" disabled={busy} onClick={()=>void dryRun()}>{busy?"Checking…":"Run due-post simulation →"}</button></div>
    <div className="ag-ws-note"><b>External publishing disabled.</b> {dispatchNote}</div>
    <div className="ag-social-insights">
      <div><h3>Delivery ledger</h3>{jobs.length===0?<div className="ag-social-empty">No staged delivery attempts yet. An approved post becomes eligible when its scheduled date arrives.</div>:jobs.map(job=><div className="ag-social-calendar" key={job.id}>
       <div><b>{job.channel}</b><small>{job.status} · attempt {job.attempts||0}{job.lastErrorCode?" · retry pending":""}</small></div><div><small>{job.id.slice(0,8)} · {dateHuman(job.completedAt||job.createdAt)}</small></div>
      </div>)}<button className="ag-secondary" disabled={busy} onClick={()=>void refreshJobs()}>Refresh delivery ledger</button></div>
      <div><h3>Social API analytics</h3><div className="ag-social-empty">Real reach and engagement will appear only after per-client social OAuth and permissions. We do not invent analytics.</div>
        <div className="ag-ws-note">Engine: Vercel Functions + Queues. Schedule storage: Neon. No separate Postiz host.</div></div>
    </div>
   </section>}
{tab==="metrics"&&<section className="ag-card">
    <div className="ag-platform-bar"><div><h2>Content and queue performance</h2><p>Based only on the selected workspace's own staging records, not social-network analytics.</p></div><button className="ag-secondary" onClick={()=>void refreshInsights()} disabled={busy}>Refresh insights</button></div>
    {!internalInsights?<div className="ag-social-empty">No internal insights available. Check the staging database connection.</div>:<>
     <div className="ag-social-stats">
      {([["Scheduled next 7 days",internalInsights.scheduledNextSevenDays],["Overdue approvals",internalInsights.overdueApproved],["Simulated deliveries",internalInsights.dispatch.simulated],["Retries exhausted",internalInsights.retryExhausted]] as [string,number][]).map(([label,value])=><div className="ag-metric" key={label}><div><span>{label}</span></div><strong>{value}</strong><small>Internal data only</small></div>)}
     </div>
     <div className="ag-social-insights">
      <div><h3>Target-channel planning</h3>{internalInsights.channelPlans.length===0?<div className="ag-social-empty">No channel plans in this workspace.</div>:internalInsights.channelPlans.map(p=><div className="ag-social-calendar" key={p.channel}><div><b>{networkNames[p.channel]||p.channel}</b></div><div>{p.count} planned targets</div></div>)}</div>
      <div><h3>Dispatch status</h3>{Object.entries(internalInsights.dispatch).map(([key,value])=><div className="ag-status" key={key}><span>{key}</span><b>{value}</b></div>)}<div className="ag-ws-note"><b>External reach and engagement unavailable.</b> This module does not invent or estimate social-platform results.</div></div>
     </div>
    </>}
   </section>}
{tab==="providers"&&<section className="ag-card">
    <div className="ag-platform-bar"><div><h2>Social connection center</h2><p>Provider requirements and permissions for the future direct integrations. No accounts are connected in staging.</p></div><button className="ag-secondary" onClick={()=>void refreshProviders()} disabled={busy}>Refresh requirements</button></div>
    <div className="ag-ws-note"><b>Provider connections are disabled.</b> Separate app registration, OAuth configuration, workspace-scoped tokens, and provider review are required before connecting live social accounts. Nothing will be published.</div>
    <div className="ag-modulegrid">{providers.map(p=><div className="ag-module" key={p.id}><span>↗</span><b>{p.name}</b><small>{p.accounts}</small><small>Authorization: {p.auth}</small><small>Setup: {p.appSetup}</small><div className="ag-social-targets"><span>Not connected</span><span>Publishing disabled</span></div></div>)}</div>
    {providers.length===0&&<div className="ag-social-empty">The staging provider registry is unavailable.</div>}
<div className="ag-social-insights"><div><h3>Meta account connection readiness</h3>
      {metaReadiness.map(m=><div className="ag-social-calendar" key={m.provider}><div><b>{m.provider==="facebook_pages"?"Facebook Pages":"Instagram Professional"}</b><small>{m.appConfigured?"App configured":"App credentials missing"}</small></div>
      <div><small>Read-only permissions: {m.permissions.join(", ")}</small></div><span className="ag-source-status deferred">OAuth not active</span></div>)}
      <p className="ag-footnote">This staging build cannot connect real accounts. No Page or Instagram token has been stored.</p>
     </div><div><h3>Privacy and approval</h3><p>Facebook Page permissions and Instagram Professional login are handled separately. Each workspace will require its own consent and encrypted tokens before read-only integration is activated.</p></div></div>
   </section>}
{tab==="media"&&<section className="ag-card">
    <div className="ag-platform-bar"><div><h2>Private media library</h2><p>Isolated, workspace-owned JPEG, PNG and WebP files. No media is public or sent to social channels.</p></div>
      <button className="ag-secondary" onClick={()=>void refreshMedia()} disabled={busy}>Refresh files</button></div>
    <div className="ag-ws-note"><b>{mediaUploads?"Private uploads enabled":mediaStorageConnected?"Private Blob connected · uploads disabled":"Private Blob not linked"}</b>
      <p>{mediaUploads?"Files are stored privately and served through authenticated routes only. Credential mode: {mediaStorageMode}.":"A private Vercel Blob store was created for staging but is not yet linked to this preview. Uploads require an exact store-ID match and a separate opt-in flag. No file is uploaded while disabled."}</p></div>
    <div className="ag-social-actions"><input aria-label="Select social image" type="file" accept="image/jpeg,image/png,image/webp" disabled={!mediaUploads||busy} onChange={e=>setSelectedMedia(e.target.files?.[0]||null)}/>
      <button className="ag-primary" disabled={!mediaUploads||!selectedMedia||busy} onClick={()=>void uploadMedia()}>{busy?"Saving…":"Upload privately"}</button></div>
    <p className="ag-footnote">Image limit: 4 MB. Video and SVG uploads are disabled. Private media cannot be used as a public social-platform publishing URL.</p>
    {mediaStatus&&<div className="ag-ws-note" role="status">{mediaStatus}</div>}
    <div className="ag-modulegrid">
      {mediaAssets.map(file=><div className="ag-card" key={file.id}>
       <img alt={file.name} src={"/api/platform/social/media/"+encodeURIComponent(file.id)+"/file?workspaceId="+encodeURIComponent(workspaceId)} style={{width:"100%",height:156,objectFit:"contain",borderRadius:8}}/>
       <b>{file.name}</b><small>{file.mime} · {(file.size/1048576).toFixed(2)} MB</small>
       <small>Private · {new Date(file.createdAt).toLocaleDateString()}</small>
      </div>)}
    </div>
    {mediaAssets.length===0&&<div className="ag-social-empty">No private images in this workspace.</div>}
   </section>}
   <p className="ag-footnote">Social Intelligence staging: drafts and content plans are real database records. The queue consumer writes only simulation/audit rows. No external posting, messaging, GHL scan, import, domain change, or billing is permitted.</p>
  </>}
 </div>;
}
