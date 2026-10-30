"use client";
import {useEffect,useState,type FormEvent} from "react";
import {SOCIAL_CHANNELS,type SocialChannel,type SocialState} from "@/lib/social-contract";
import {localMonthBounds,localDayKey,shiftMonth} from "@/lib/social-calendar-contract";
type Post={id:string;workspaceId:string;content:string;state:SocialState;channels:string[];scheduledAt:string|null;createdAt:string};
type Workspace={id:string;name:string;slug:string};
type DispatchJob={id:string;postId:string;channel:string;status:string;attempts:number;nextAttemptAt:string|null;lastErrorCode:string|null;createdAt:string;completedAt:string|null};
type QueueProbe={id:string;workspaceId:string;status:"prepared"|"sent"|"acknowledged"|"send_failed";createdAt:string;sentAt:string|null;acknowledgedAt:string|null;lastErrorCode:string|null};
type BlobDiagnostic={storeCreated:boolean;storeConnected:boolean;checkedLive:boolean;uploadsEnabled:boolean;status:string;mode:string;private:true};
type DeliveryMonitor={summary:{queuedOverHour:number;leasesOverdue:number;retryScheduled:number;retryExhausted:number;readyPending:number;outdatedRevision:number;attention:number};items:{id:string;postId:string;channel:string;status:string;reason:string;attempts:number;lastUpdated:string}[];autoRecoveryEnabled:false};
type MediaAsset={id:string;workspaceId:string;name:string;mime:string;size:number;createdAt:string};
type MetaReadiness={provider:"facebook_pages"|"instagram_professional";appConfigured:boolean;permissions:string[];accessType:"read_only";launchEnabled:boolean;};
type MetaCandidate={id:string;name:string;tasks?:string[];accountType?:string};
type MetaPending={id:string;provider:"facebook_pages"|"instagram_professional";candidates:MetaCandidate[];expiresAt:string};
type MetaConnection={id:string;provider:"facebook_pages"|"instagram_professional";accountId:string;name:string;connectedAt:string;expiresAt:string|null;expired:boolean};
type MetaInventory={connections:MetaConnection[];pending:MetaPending[];readOnly:true;publishingEnabled:false};
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
 const [calendarMonth,setCalendarMonth]=useState(()=>new Date().getFullYear()+"-"+String(new Date().getMonth()+1).padStart(2,"0"));
 const [calendarSelected,setCalendarSelected]=useState("");
 const [calendarPosts,setCalendarPosts]=useState<Post[]>([]);
 const [calendarTruncated,setCalendarTruncated]=useState(false);
 const [calendarError,setCalendarError]=useState("");
 const [calendarStatus,setCalendarStatus]=useState("all");
 const [monitor,setMonitor]=useState<DeliveryMonitor|null>(null);
 const [internalInsights,setInternalInsights]=useState<InternalInsights|null>(null);
 const [providers,setProviders]=useState<ProviderReadiness[]>([]);
 const [metaReadiness,setMetaReadiness]=useState<MetaReadiness[]>([]);
 const [metaInventory,setMetaInventory]=useState<MetaInventory|null>(null);
 const [metaMessage,setMetaMessage]=useState("");
 const [mediaAssets,setMediaAssets]=useState<MediaAsset[]>([]);
 const [linkTargetPost,setLinkTargetPost]=useState("");
 const [linkedMedia,setLinkedMedia]=useState<MediaAsset[]>([]);
 const [mediaUploads,setMediaUploads]=useState(false);
 const [mediaStorageConnected,setMediaStorageConnected]=useState(false);
 const [mediaStorageMode,setMediaStorageMode]=useState("none");
 const [selectedMedia,setSelectedMedia]=useState<File|null>(null);
 const [mediaStatus,setMediaStatus]=useState("");
 const [dispatchNote,setDispatchNote]=useState("Nothing has been dispatched in staging.");
 const [queueProbes,setQueueProbes]=useState<QueueProbe[]>([]);
 const [probeMessage,setProbeMessage]=useState("Queue delivery has not been tested from this browser.");
 const [blobDiagnostic,setBlobDiagnostic]=useState<BlobDiagnostic|null>(null);
 const [tab,setTab]=useState<"composer"|"calendar"|"insights"|"metrics"|"providers"|"media">("composer");
 useEffect(()=>{if(new URLSearchParams(window.location.search).get("social")==="connections"){
  setTab("providers");
  const status=new URLSearchParams(window.location.search).get("meta");
  if(status==="select")setMetaMessage("Meta authorization completed. Select the account you want to connect below.");
  if(status==="failed")setMetaMessage("Meta authorization did not complete. Check developer-app permissions and redirect URL.");
  if(status==="canceled")setMetaMessage("Authorization canceled. No account was connected.");
 }},[]);
 useEffect(()=>{
  fetch("/api/platform/workspaces",{credentials:"same-origin",cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||"Workspaces unavailable");return j;}).then(j=>{const list=Array.isArray(j.workspaces)?j.workspaces:[];setWorkspaces(list);setWorkspaceId(list[0]?.id||"");}).catch(e=>setMessage(e.message)).finally(()=>setLoading(false));
 },[]);
 useEffect(()=>{setLinkTargetPost("");setLinkedMedia([]);if(workspaceId){setSelectedMedia(null);void refresh(workspaceId);void refreshJobs(workspaceId);void refreshInsights(workspaceId);void refreshProviders(workspaceId);void refreshMedia(workspaceId);void refreshMeta(workspaceId);void refreshQueueProbes(workspaceId);setBlobDiagnostic(null);}else {setQueueProbes([]);setBlobDiagnostic(null);setPosts([]);setJobs([]);setInternalInsights(null);setProviders([]);setMediaAssets([]);setMetaReadiness([]);setMetaInventory(null);}},[workspaceId]);
 useEffect(()=>{if(workspaceId&&linkTargetPost){void refreshLinkedMedia(workspaceId,linkTargetPost);}else setLinkedMedia([]);},[workspaceId,linkTargetPost]);
 useEffect(()=>{if(workspaceId){void refreshCalendar(workspaceId,calendarMonth);void refreshMonitor(workspaceId);}else {setCalendarPosts([]);setMonitor(null);}},[workspaceId,calendarMonth]);
 async function refresh(id=workspaceId){
  if(!id)return;
  try{
   const r=await fetch("/api/platform/social?workspaceId="+encodeURIComponent(id),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Social drafts unavailable");setPosts(Array.isArray(j.posts)?j.posts:[]);
  }catch(e){setMessage(e instanceof Error?e.message:"Could not load social drafts");}
 }
 async function refreshCalendar(id=workspaceId,month=calendarMonth){
  const bounds=localMonthBounds(month);if(!id||!bounds)return;
  try{
   const query=new URLSearchParams({workspaceId:id,start:bounds.start,end:bounds.end});
   const r=await fetch("/api/platform/social/calendar?"+query.toString(),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Calendar unavailable");
   setCalendarPosts(Array.isArray(j.posts)?j.posts:[]);setCalendarTruncated(j.truncated===true);setCalendarError("");
  }catch(e){setCalendarError(e instanceof Error?e.message:"Unable to load calendar");}
 }
 async function refreshMonitor(id=workspaceId){
  if(!id)return;
  try{
   const r=await fetch("/api/platform/social/monitor?workspaceId="+encodeURIComponent(id),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Delivery monitor unavailable");
   setMonitor(j as DeliveryMonitor);
  }catch(e){setDispatchNote(e instanceof Error?e.message:"Delivery monitor unavailable");}
 }
 async function duplicateAsDraft(p:Post){
  if(!workspaceId||busy)return;setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/platform/social",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",
    body:JSON.stringify({workspaceId,content:p.content,state:"draft",channels:p.channels,scheduledAt:null})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Unable to duplicate draft");
   await refresh();setMessage("Copied as a new draft. Nothing was queued or published.");setTab("composer");
  }catch(e){setMessage(e instanceof Error?e.message:"Could not duplicate content");}finally{setBusy(false);}
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
   await Promise.all([refresh(),refreshCalendar(),refreshInsights(),refreshMonitor()]);reset();setMessage("Saved in staging. Nothing was published or sent.");
  }catch(e){setMessage(e instanceof Error?e.message:"Save failed");}
  finally{setBusy(false);}
 }
 async function remove(id:string){
  if(!workspaceId)return;setBusy(true);setMessage("");
  try{const r=await fetch("/api/platform/social/"+encodeURIComponent(id)+"?workspaceId="+encodeURIComponent(workspaceId),{method:"DELETE",credentials:"same-origin"});
  const j=await r.json();if(!r.ok)throw Error(j.error||"Unable to delete draft");await Promise.all([refresh(),refreshCalendar(),refreshInsights(),refreshMonitor()]);if(editing===id)reset();setMessage("Draft removed from staging.");}
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
   setMetaReadiness(Array.isArray(j.connections)?j.connections:[]);await refreshMetaInventory(id);
  }catch(e){setMediaStatus(e instanceof Error?e.message:"Meta readiness unavailable");}
 }
 async function refreshMetaInventory(id=workspaceId){
  if(!id)return;
  try{
   const r=await fetch("/api/platform/social/meta/connections?workspaceId="+encodeURIComponent(id),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Meta accounts unavailable");
   setMetaInventory(j as MetaInventory);
  }catch(e){setMetaMessage(e instanceof Error?e.message:"Meta account listing unavailable");}
 }
 async function connectMeta(provider:"facebook_pages"|"instagram_professional"){
  if(!workspaceId||busy)return;setBusy(true);setMetaMessage("Starting read-only authorization…");
  try{
   const r=await fetch("/api/platform/social/meta/start",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({workspaceId,provider})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Meta authorization unavailable");
   if(typeof j.authorizeUrl!=="string")throw Error("Invalid authorization link");
   window.location.assign(j.authorizeUrl);
  }catch(e){setMetaMessage(e instanceof Error?e.message:"Meta connection unavailable");setBusy(false);}
 }
 async function selectMetaAccount(pendingId:string,accountId:string){
  if(!workspaceId||busy)return;setBusy(true);setMetaMessage("");
  try{
   const r=await fetch("/api/platform/social/meta/connections",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",
    body:JSON.stringify({workspaceId,pendingId,accountId})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Unable to select account");
   setMetaMessage("Connected for read-only account discovery. Publishing remains disabled.");
   await refreshMetaInventory();
  }catch(e){setMetaMessage(e instanceof Error?e.message:"Account selection failed");}finally{setBusy(false);}
 }
 async function disconnectMetaAccount(connectionId:string){
  if(!workspaceId||busy||!window.confirm("Disconnect this account from Agency Control? This clears the locally stored token; you can also revoke app access at Meta."))return;
  setBusy(true);setMetaMessage("");
  try{
   const r=await fetch("/api/platform/social/meta/connections",{method:"DELETE",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({workspaceId,connectionId})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Unable to disconnect account");
   setMetaMessage("Account disconnected locally. For complete revocation, also remove app access in Meta settings.");
   await refreshMetaInventory();
  }catch(e){setMetaMessage(e instanceof Error?e.message:"Disconnect failed");}finally{setBusy(false);}
 }
 async function refreshLinkedMedia(workspace=workspaceId,post=linkTargetPost){
  if(!workspace||!post)return;
  try{
   const r=await fetch("/api/platform/social/"+encodeURIComponent(post)+"/media?workspaceId="+encodeURIComponent(workspace),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Post media unavailable");
   setLinkedMedia(Array.isArray(j.media)?j.media:[]);
  }catch(e){setMediaStatus(e instanceof Error?e.message:"Could not read linked media");}
 }
 async function attachAsset(mediaId:string){
  if(!workspaceId||!linkTargetPost||busy)return;setBusy(true);setMediaStatus("");
  try{
   const r=await fetch("/api/platform/social/"+encodeURIComponent(linkTargetPost)+"/media",{
    method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",
    body:JSON.stringify({workspaceId,mediaId})
   });
   const j=await r.json();if(!r.ok)throw Error(j.error||"Could not attach media");
   await refreshLinkedMedia();setMediaStatus("Image linked to the selected post. Nothing was published.");
  }catch(e){setMediaStatus(e instanceof Error?e.message:"Attachment failed");}finally{setBusy(false);}
 }
 async function unlinkAsset(mediaId:string){
  if(!workspaceId||!linkTargetPost||busy)return;setBusy(true);setMediaStatus("");
  try{
   const r=await fetch("/api/platform/social/"+encodeURIComponent(linkTargetPost)+"/media/"+encodeURIComponent(mediaId)+"?workspaceId="+encodeURIComponent(workspaceId),{
    method:"DELETE",credentials:"same-origin"
   });
   const j=await r.json();if(!r.ok)throw Error(j.error||"Could not detach media");
   await refreshLinkedMedia();setMediaStatus("Image unlinked. The original private file remains in the media library.");
  }catch(e){setMediaStatus(e instanceof Error?e.message:"Unlink failed");}finally{setBusy(false);}
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
 async function refreshQueueProbes(id=workspaceId){
  if(!id)return;
  try{
   const r=await fetch("/api/platform/social/diagnostics/queue?workspaceId="+encodeURIComponent(id),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Queue probe ledger unavailable");
   setQueueProbes(Array.isArray(j.probes)?j.probes:[]);
   const newest=j.probes?.[0] as QueueProbe|undefined;
   if(newest?.status==="acknowledged")setProbeMessage("Verified: Vercel Queue delivered this probe to its private function.");
   else if(newest?.status==="sent")setProbeMessage("Probe sent. Delivery is not confirmed yet; refresh to check acknowledgement.");
   else if(newest?.status==="send_failed")setProbeMessage("Queue send failed. Review staging deployment logs.");
  }catch(e){setProbeMessage(e instanceof Error?e.message:"Queue status unavailable");}
 }
 async function runQueueProbe(){
  if(!workspaceId||busy)return;
  setBusy(true);setProbeMessage("Sending an isolated queue-only self-test. No social post will be created.");
  try{
   const r=await fetch("/api/platform/social/diagnostics/queue",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({workspaceId})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Queue self-test failed");
   setProbeMessage("Vercel accepted the diagnostic message. Waiting for private consumer acknowledgement.");
   await refreshQueueProbes();
  }catch(e){setProbeMessage(e instanceof Error?e.message:"Unable to send the queue probe");}
  finally{setBusy(false);}
 }
 async function testBlobRoundTrip(){
  if(!workspaceId||busy)return;
  setBusy(true);setMediaStatus("Testing private upload, download and cleanup using a synthetic 1-pixel image…");
  try{
   const r=await fetch("/api/platform/social/media/diagnostics?workspaceId="+encodeURIComponent(workspaceId),{
    method:"POST",credentials:"same-origin"
   });
   const j=await r.json();if(!r.ok)throw Error(j.error||j.note||"Private round-trip unavailable");
   setMediaStatus(j.roundTripVerified===true?"Verified: synthetic image uploaded privately, read back and deleted. No public file or social post was created.":"Round-trip did not complete.");
   await refreshMedia();
  }catch(e){setMediaStatus(e instanceof Error?e.message:"Private media round-trip failed");}
  finally{setBusy(false);}
 }
 async function checkBlobStorage(){
  if(!workspaceId||busy)return;setMediaStatus("Verifying real private Blob read access…");
  try{
   const r=await fetch("/api/platform/social/media/diagnostics?workspaceId="+encodeURIComponent(workspaceId),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();setBlobDiagnostic(j as BlobDiagnostic);
   if(j.storeConnected===true&&j.checkedLive===true)setMediaStatus("Private Blob list request succeeded. Uploads remain "+(j.uploadsEnabled?"enabled":"disabled")+".");
   else setMediaStatus(j.status==="not-connected"?"Private Blob store exists but is not linked to this staging deployment.":j.status||"Private Blob connectivity check failed.");
  }catch(e){setMediaStatus(e instanceof Error?e.message:"Blob diagnostic unavailable");}
 }
 async function dryRun(){
  if(!workspaceId)return;setBusy(true);setDispatchNote("Preparing due approved posts…");
  try{
   const r=await fetch("/api/platform/social/dispatch",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({workspaceId})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Queue not available");
   setDispatchNote("Submitted "+j.submitted+" jobs to Vercel Queues, "+j.failed+" failed, "+j.exhaustedRetries+" exhausted retries. "+(j.submitted===0?"Only approved content with a past-due date is eligible.":"Delivery is simulated, not published."));
   await refreshJobs();await refreshInsights();await refreshMonitor();
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
   {tab==="calendar"&&<section className="ag-card">
    <div className="ag-platform-bar"><div><h2>Monthly content calendar</h2><p>All dates represent internal plans in your browser's local time zone. Nothing here is published automatically.</p></div>
      <div className="ag-social-actions"><button className="ag-secondary" disabled={busy} onClick={()=>{setCalendarMonth(m=>shiftMonth(m,-1));setCalendarSelected("");}}>← Previous</button>
      <input aria-label="Calendar month" type="month" value={calendarMonth} min="2020-01" max="2100-12" onChange={e=>{if(localMonthBounds(e.target.value)){setCalendarMonth(e.target.value);setCalendarSelected("");}}}/>
      <button className="ag-secondary" disabled={busy} onClick={()=>{setCalendarMonth(m=>shiftMonth(m,1));setCalendarSelected("");}}>Next →</button></div></div>
    {calendarError&&<div className="ag-error" role="alert">{calendarError}</div>}
    {calendarTruncated&&<div className="ag-ws-note">This month has more than 500 planned items. Showing the first 500 by scheduled date.</div>}
    <div className="ag-calendar-weekdays">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day=><b key={day}>{day}</b>)}</div>
    <div className="ag-calendar-grid">
     {Array.from({length:new Date(Number(calendarMonth.slice(0,4)),Number(calendarMonth.slice(5,7)),0).getDate()},(_,i)=>{
      const key=calendarMonth+"-"+String(i+1).padStart(2,"0");
      const entries=calendarPosts.filter(p=>p.scheduledAt&&localDayKey(p.scheduledAt)===key);
      const startOn=(new Date(Number(calendarMonth.slice(0,4)),Number(calendarMonth.slice(5,7))-1,1).getDay()+6)%7;
      return <button type="button" key={key} style={i===0?{gridColumnStart:startOn+1}:undefined}
       className={"ag-calendar-day "+((calendarSelected||calendarMonth+"-01")===key?"selected":"")}
       onClick={()=>setCalendarSelected(key)} aria-label={key+": "+entries.length+" scheduled items"}>
       <strong>{i+1}</strong><small>{entries.length?entries.length+" planned":""}</small>
       {entries.slice(0,2).map(p=><span key={p.id} className={"ag-calendar-pill "+p.state}>{p.state+" · "+p.content.slice(0,24)}</span>)}
       {entries.length>2&&<small>+{entries.length-2} more</small>}
      </button>;
     })}
    </div>
    <div className="ag-platform-bar"><div><h3>{new Date((calendarSelected||calendarMonth+"-01")+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</h3>
       <p>Review and edit this day's planned content, or start a new draft.</p></div>
       <div className="ag-social-actions"><select aria-label="Filter post status" value={calendarStatus} onChange={e=>setCalendarStatus(e.target.value)}>
       <option value="all">All states</option><option value="draft">Drafts</option><option value="planned">Planned</option><option value="approved">Approved</option></select>
       <button className="ag-secondary" onClick={()=>{setEditing(null);setContent("");setState("draft");setChannels([]);setSchedule((calendarSelected||calendarMonth+"-01")+"T09:00");setTab("composer");}}>+ Draft for day</button></div></div>
    <div className="ag-social-list">
      {calendarPosts.filter(p=>p.scheduledAt&&localDayKey(p.scheduledAt)===(calendarSelected||calendarMonth+"-01")&&(calendarStatus==="all"||p.state===calendarStatus)).map(p=>
       <div className="ag-social-calendar" key={p.id}><div><b>{dateHuman(p.scheduledAt)}</b><small>{p.state.toUpperCase()}</small></div>
         <div><p>{p.content}</p><small>{p.channels.map(x=>networkNames[x]||x).join(", ")||"No channels"}</small></div>
         <div className="ag-social-actions"><button disabled={busy} className="ag-secondary" onClick={()=>edit(p)}>Edit</button>
           <button disabled={busy} className="ag-secondary" onClick={()=>void duplicateAsDraft(p)}>Copy draft</button></div></div>)}
      {!calendarPosts.some(p=>p.scheduledAt&&localDayKey(p.scheduledAt)===(calendarSelected||calendarMonth+"-01")&&(calendarStatus==="all"||p.state===calendarStatus))&&
       <div className="ag-social-empty">No content planned for this date and status.</div>}
    </div>
   </section>}
      {tab==="insights"&&<section className="ag-card">
    <div className="ag-platform-bar"><div><h2>Vercel-native delivery simulator</h2><p>Approved due posts are dispatched to Vercel Queues, but the private worker only records simulated delivery in Neon.</p></div>
      <button className="ag-primary" disabled={busy} onClick={()=>void dryRun()}>{busy?"Checking…":"Run due-post simulation →"}</button></div>
    <div className="ag-ws-note"><b>External publishing disabled.</b> {dispatchNote}</div>
    <div className="ag-ws-note">
      <b>Private queue delivery verification</b>
      <p>Send a synthetic diagnostic message to a separate Vercel Queue consumer. This does not create or publish any social post.</p>
      <div className="ag-social-actions">
       <button className="ag-secondary" disabled={busy||!workspaceId} onClick={()=>void runQueueProbe()}>Run queue self-test</button>
       <button className="ag-secondary" disabled={busy||!workspaceId} onClick={()=>void refreshQueueProbes()}>Refresh result</button>
      </div>
      <p role="status">{probeMessage}</p>
      {queueProbes.slice(0,3).map(probe=><div className="ag-social-calendar" key={probe.id}>
       <span><b>{probe.status==="acknowledged"?"Delivered to worker":probe.status}</b><small>{new Date(probe.createdAt).toLocaleString()}</small></span>
       <span><small>{probe.acknowledgedAt?"Acknowledged "+new Date(probe.acknowledgedAt).toLocaleTimeString():"Not yet acknowledged"}</small></span>
      </div>)}
    </div>
    <div className="ag-social-actions"><button className="ag-secondary" disabled={busy} onClick={()=>void refreshMonitor()}>Check delivery health</button>
      <span className="ag-social-workspace">Review only · no automatic recovery</span></div>
    <div className="ag-social-stats">
     {([["Needs review",monitor?.summary.attention??"—"],["Queued over 1 hour",monitor?.summary.queuedOverHour??"—"],
       ["Expired leases",monitor?.summary.leasesOverdue??"—"],["Retries exhausted",monitor?.summary.retryExhausted??"—"]] as [string,number|string][]).map(([label,n])=>
       <div className="ag-metric" key={label}><div><span>{label}</span></div><strong>{n}</strong><small>Internal delivery status</small></div>)}
    </div>
    {Boolean(monitor?.items.length)&&<div className="ag-ws-note"><b>Review flagged jobs:</b>
      <div className="ag-social-list">{monitor?.items.slice(0,25).map(item=><div className="ag-social-calendar" key={item.id}>
       <div><b>{item.channel}</b><small>{item.status}</small></div><div><small>{item.reason.replaceAll("_"," ")} · {dateHuman(item.lastUpdated)}</small></div>
       <span>{item.attempts} attempts</span></div>)}</div>
      <p>No resend or external publishing is performed by this monitor.</p></div>}
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
    <div className="ag-platform-bar"><div><h2>Social Connections</h2><p>Connect selected Facebook Pages or Instagram Professional accounts for read-only account discovery. No publishing permissions are requested.</p></div>
      <button className="ag-secondary" disabled={busy} onClick={()=>void refreshMeta()}>Refresh connections</button></div>
    <div className="ag-ws-note"><b>Single-administrator mode.</b> Developer credentials must be set in this staging preview before connecting. All tokens stay encrypted in Neon, and publishing remains disabled.</div>
    {metaMessage&&<div className="ag-ws-note" role="status">{metaMessage}</div>}
    <div className="ag-modulegrid">
      {metaReadiness.map(m=><div className="ag-card" key={m.provider}>
       <h3>{m.provider==="facebook_pages"?"Facebook Pages":"Instagram Professional"}</h3>
       <small>{m.appConfigured?"Meta developer app configured":"Meta developer app credentials missing"}</small>
       <p>Read-only permissions: {m.permissions.join(", ")}</p>
       <button className="ag-primary" disabled={!m.launchEnabled||busy} onClick={()=>void connectMeta(m.provider)}>
         {m.launchEnabled?"Authorize and select account":"Connection not configured"}
       </button>
       <small>Account access only. Posts, messages, comments and publishing are not enabled.</small>
      </div>)}
    </div>
    <h3>Choose from newly authorized accounts</h3>
    {!metaInventory?.pending.length&&<div className="ag-social-empty">No pending account selections. Authorize Facebook or Instagram first.</div>}
    {metaInventory?.pending.map(pending=><div className="ag-card" key={pending.id}>
      <b>{pending.provider==="facebook_pages"?"Available Facebook Pages":"Available Instagram accounts"}</b>
      <small>Selection expires {new Date(pending.expiresAt).toLocaleString()}</small>
      <div className="ag-social-list">{pending.candidates.map(account=><div className="ag-social-calendar" key={account.id}>
       <span><b>{account.name}</b><small>{account.accountType||"Page"} · {account.id}</small></span>
       <button className="ag-secondary" disabled={busy} onClick={()=>void selectMetaAccount(pending.id,account.id)}>Connect read-only</button>
      </div>)}</div>
      <p className="ag-footnote">Only the selected account will be connected. To connect another Page, authorize again.</p>
    </div>)}
    <h3>Connected accounts</h3>
    {!metaInventory?.connections.length&&<div className="ag-social-empty">No Facebook or Instagram accounts are connected yet.</div>}
    {metaInventory?.connections.map(account=><div className="ag-social-calendar" key={account.id}>
      <div><b>{account.name}</b><small>{account.provider==="facebook_pages"?"Facebook Page":"Instagram Professional"} · Read-only</small></div>
      <div><small>{account.expired?"Token expired":account.expiresAt?"Token expires "+new Date(account.expiresAt).toLocaleDateString():"Token expiry not supplied"}</small></div>
      <button className="ag-secondary" disabled={busy} onClick={()=>void disconnectMetaAccount(account.id)}>Disconnect</button>
    </div>)}
    <div className="ag-ws-note"><b>Additional channels planned</b>
      <p>LinkedIn, TikTok, YouTube, X, Threads and Pinterest require independent developer applications. Their OAuth connections are not active in this milestone.</p>
    </div>
   </section>}
{tab==="media"&&<section className="ag-card">
    <div className="ag-platform-bar"><div><h2>Private media library</h2><p>Isolated, workspace-owned JPEG, PNG and WebP files. No media is public or sent to social channels.</p></div>
      <div className="ag-social-actions">
       <button className="ag-secondary" onClick={()=>void checkBlobStorage()} disabled={busy}>Verify private Blob access</button>
       <button className="ag-secondary" onClick={()=>void testBlobRoundTrip()} disabled={busy||!mediaUploads}>Test private upload/read/delete</button>
       <button className="ag-secondary" onClick={()=>void refreshMedia()} disabled={busy}>Refresh files</button>
      </div></div>
    <div className="ag-ws-note"><b>{mediaUploads?"Private uploads enabled":mediaStorageConnected?"Private Blob connected · uploads disabled":"Private Blob not linked"}</b>
      <p>{mediaUploads?"Files are stored privately and served through authenticated routes only. Credential mode: "+mediaStorageMode+".":"A private Vercel Blob store was created for staging but is not yet linked to this preview. Uploads require an exact store-ID match and a separate opt-in flag. No file is uploaded while disabled."}</p></div>
    {blobDiagnostic&&<div className="ag-ws-note">
       <b>{blobDiagnostic.storeConnected&&blobDiagnostic.checkedLive?"Verified private Blob read":"Storage not verified"}</b>
       <p>Live checked: {blobDiagnostic.checkedLive?"yes":"no"} · Connection: {blobDiagnostic.status} · Uploads: {blobDiagnostic.uploadsEnabled?"enabled":"disabled"}</p>
      </div>}
    <div className="ag-social-actions"><input aria-label="Select social image" type="file" accept="image/jpeg,image/png,image/webp" disabled={!mediaUploads||busy} onChange={e=>setSelectedMedia(e.target.files?.[0]||null)}/>
      <button className="ag-primary" disabled={!mediaUploads||!selectedMedia||busy} onClick={()=>void uploadMedia()}>{busy?"Saving…":"Upload privately"}</button></div>
    <p className="ag-footnote">Image limit: 4 MB. Video and SVG uploads are disabled. Private media cannot be used as a public social-platform publishing URL.</p>
    {mediaStatus&&<div className="ag-ws-note" role="status">{mediaStatus}</div>}
    <div className="ag-platform-bar"><div><h3>Attach images to a post</h3><p>Select a content item to link private media. The post revision updates, but nothing is published.</p></div>
      <select aria-label="Select post to attach media" value={linkTargetPost} onChange={e=>setLinkTargetPost(e.target.value)}>
       <option value="">Select an existing post</option>
       {posts.map(post=><option key={post.id} value={post.id}>{post.state.toUpperCase()} — {post.content.slice(0,55)}</option>)}
      </select></div>
    {Boolean(linkTargetPost)&&<div className="ag-ws-note"><b>Linked images ({linkedMedia.length}/10)</b>
      <div className="ag-social-targets">{linkedMedia.map(file=><span key={file.id}>{file.name} <button className="ag-secondary" disabled={busy} onClick={()=>void unlinkAsset(file.id)}>Unlink</button></span>)}</div>
      {linkedMedia.length===0&&<p>This post has no images attached yet.</p>}</div>}
    <div className="ag-modulegrid">
      {mediaAssets.map(file=><div className="ag-card" key={file.id}>
       <img alt={file.name} src={"/api/platform/social/media/"+encodeURIComponent(file.id)+"/file?workspaceId="+encodeURIComponent(workspaceId)} style={{width:"100%",height:156,objectFit:"contain",borderRadius:8}}/>
       <b>{file.name}</b><small>{file.mime} · {(file.size/1048576).toFixed(2)} MB</small>
       <small>Private · {new Date(file.createdAt).toLocaleDateString()}</small>
       <button className="ag-secondary" disabled={!linkTargetPost||busy||linkedMedia.some(item=>item.id===file.id)||linkedMedia.length>=10} onClick={()=>void attachAsset(file.id)}>{linkedMedia.some(item=>item.id===file.id)?"Linked ✓":"Attach to post"}</button>
      </div>)}
    </div>
    {mediaAssets.length===0&&<div className="ag-social-empty">No private images in this workspace.</div>}
   </section>}
   <p className="ag-footnote">Social Intelligence staging: drafts and content plans are real database records. The queue consumer writes only simulation/audit rows. No external posting, messaging, GHL scan, import, domain change, or billing is permitted.</p>
  </>}
 </div>;
}
