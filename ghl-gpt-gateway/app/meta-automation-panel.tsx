"use client";
import {useEffect,useMemo,useState,type FormEvent} from "react";
import MetaSocialCalendar from "./meta-social-calendar";
type Account={id:string;provider:"facebook_pages"|"instagram_professional";name:string;accountId:string;expired:boolean};
type Kind="facebook_post"|"facebook_photo"|"facebook_link"|"instagram_photo"|"facebook_comment_reply"|"instagram_comment_reply"|"facebook_message_reply"|"instagram_message_reply";
type Action={id:string;connectionId:string;kind:Kind;body:string;mediaUrl:string|null;targetId:string|null;status:string;scheduledAt:string;externalRef:string|null;errorCode:string|null;approvedAt:string|null};
type Inbound={id:string;connectionId:string;type:string;targetId:string|null;senderId:string|null;occurredAt:string};
type Flags={liveWrites:boolean;scheduled:boolean;webhook:boolean};
const opts=(provider:string):{kind:Kind;label:string}[]=>provider==="facebook_pages"?[
 {kind:"facebook_post",label:"Facebook text post"},
 {kind:"facebook_photo",label:"Facebook photo post"},
 {kind:"facebook_link",label:"Facebook link post"},
 {kind:"facebook_comment_reply",label:"Reply to a Facebook comment"},
 {kind:"facebook_message_reply",label:"Reply to a customer Messenger message"}
]:[
 {kind:"instagram_photo",label:"Instagram photo with caption"},
 {kind:"instagram_comment_reply",label:"Reply to an Instagram comment"},
 {kind:"instagram_message_reply",label:"Reply to an Instagram customer message"}
];
type Draft={workspaceId:string;connectionId:string;kind:Kind;body:string;mediaUrl:string|null;targetId:string|null;scheduledAt:string;idempotencyKey:string};
const needsMedia=(k:Kind)=>["facebook_photo","facebook_link","instagram_photo"].includes(k);
const localTime=(minutes=5)=>{const t=new Date(Date.now()+minutes*60000);return new Date(t.getTime()-t.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const postStatus=(v:string)=>v==="draft"?"Awaiting approval":v==="approved"?"Approved / scheduled":v==="sending"?"Sending, check before retrying":v==="sent"?"Delivered":v==="uncertain"?"Check the provider before taking any action":v==="blocked"?"Blocked: verify permissions":v==="canceled"?"Canceled":v;
export default function MetaAutomationPanel({workspaceId,accounts,mode="posting",onOpenPosting}:{workspaceId:string;accounts:Account[];mode?:"posting"|"calendar"|"inbox";onOpenPosting?:()=>void}){
 const [items,setItems]=useState<Action[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [queueFilter,setQueueFilter]=useState("active");
 const [queueOpen,setQueueOpen]=useState(false);
 const [events,setEvents]=useState<Inbound[]>([]);
 const [flags,setFlags]=useState<Flags>({liveWrites:false,scheduled:false,webhook:false});
 const [connectionId,setConnectionId]=useState("");
 const [kind,setKind]=useState<Kind>("facebook_post");
 const [body,setBody]=useState("");
 const [mediaUrl,setMediaUrl]=useState("");
 const [target,setTarget]=useState("");
 const [scheduledAt,setScheduledAt]=useState(localTime());
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [simulation,setSimulation]=useState("");
 const [batch,setBatch]=useState<Draft[]>([]);
 const [inboxActivity,setInboxActivity]=useState<{connectionId:string;snapshot:{recentConversationCount:number;moreAvailable:boolean;lastActivity:string[];unreadMessages:number|null;checkedAt:string}}|null>(null);
 const [inboxBusy,setInboxBusy]=useState(false);
 const account=accounts.find(a=>a.id===connectionId);
 const choices=opts(account?.provider||"facebook_pages").filter(o=>mode==="inbox"?o.kind.endsWith("_reply"):!o.kind.endsWith("_reply"));
 const reply=kind.endsWith("_reply");
 const targetType=kind.endsWith("message_reply")?"message":"comment";
 const inbound=useMemo(()=>events.filter(e=>e.connectionId===connectionId&&e.type===targetType&&
  (targetType==="message"?Boolean(e.senderId)&&Date.parse(e.occurredAt)>Date.now()-24*3600*1000:Boolean(e.targetId))),[events,connectionId,targetType]);
 useEffect(()=>{
  if(!accounts.some(a=>a.id===connectionId)){setConnectionId(accounts[0]?.id||"");}
 },[accounts,connectionId]);
 useEffect(()=>{setKind(opts(account?.provider||"facebook_pages").find(o=>mode==="inbox"?o.kind.endsWith("_reply"):!o.kind.endsWith("_reply"))!.kind);setTarget("");},[account?.provider,connectionId,mode]);
 useEffect(()=>{setBody("");setMediaUrl("");},[mode==="inbox"]);
 async function loadInboxActivity(){
  if(!workspaceId||!connectionId||account?.provider!=="facebook_pages"||inboxBusy)return;
  setInboxBusy(true);setInboxActivity(null);setMessage("");
  try{
   const q=new URLSearchParams({workspaceId,connectionId});
   const r=await fetch("/api/platform/social/meta/inbox-activity?"+q.toString(),{credentials:"same-origin",cache:"no-store"});
   const v=await r.json();if(!r.ok||v.connectionId!==connectionId||v.readOnly!==true||v.snapshot?.source!=="meta_graph_api")throw Error(v.error||"Messenger activity unavailable");
   setInboxActivity({connectionId,snapshot:v.snapshot});
  }catch(e){setMessage(e instanceof Error?e.message:"Messenger activity unavailable");}finally{setInboxBusy(false);}
 }
 async function copyManual(text:string){
  try{await navigator.clipboard.writeText(text);setMessage("Copied. Open Meta Business Suite to schedule manually. REACH has not sent or scheduled anything with Meta.");}
  catch{setMessage("Clipboard unavailable. Select and copy the post text manually.");}
 }
 async function refresh(){
  if(!workspaceId){setItems([]);setEvents([]);return;}
  try{
   const r=await fetch("/api/platform/social/meta/automation?workspaceId="+encodeURIComponent(workspaceId),{credentials:"same-origin",cache:"no-store"});
   const data=await r.json();
   if(!r.ok)throw Error(data.error||"Social automation is unavailable");
   setItems(Array.isArray(data.actions)?data.actions:[]);
   setEvents(Array.isArray(data.inbox)?data.inbox:[]);
   setFlags(data.flags||{liveWrites:false,scheduled:false,webhook:false});setLoaded(true);
  }catch(e){setLoaded(false);setFlags({liveWrites:false,scheduled:false,webhook:false});setMessage(e instanceof Error?e.message:"Could not load automations");}
 }
 useEffect(()=>{void refresh();},[workspaceId]);
 async function create(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!workspaceId||!connectionId||busy)return;
  setBusy(true);setMessage("");
  try{
   const actionTarget=reply?target:null;
   if(reply&&!actionTarget)throw Error("Choose a recent customer interaction before replying.");
   const request={workspaceId,connectionId,kind,body,mediaUrl:needsMedia(kind)?mediaUrl:null,
    targetId:actionTarget,scheduledAt:new Date(scheduledAt).toISOString(),idempotencyKey:crypto.randomUUID()};
   const r=await fetch("/api/platform/social/meta/automation",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(request)});
   const v=await r.json();if(!r.ok)throw Error(v.error||"Unable to save draft");
   setBody("");setMediaUrl("");setQueueOpen(true);setMessage("Saved as a draft. Nothing has been sent. Approve the exact account and content before delivery.");
   await refresh();
  }catch(e){setMessage(e instanceof Error?e.message:"Could not save draft");}finally{setBusy(false);}
 }
 function addBatch(){
  if(!workspaceId||!connectionId||!body.trim()||reply||account?.expired||batch.length>=10){setMessage("Select an active account, enter content and use a publishing format. Maximum 10 drafts.");return;}
  if(needsMedia(kind)&&!mediaUrl.trim()){setMessage("Enter a public HTTPS URL for this format.");return;}
  const date=new Date(scheduledAt);
  if(!Number.isFinite(date.getTime())||date.getTime()<Date.now()-60000){setMessage("Select a valid future scheduled time.");return;}
  setBatch(old=>[...old,{workspaceId,connectionId,kind,body,mediaUrl:needsMedia(kind)?mediaUrl:null,targetId:null,scheduledAt:date.toISOString(),idempotencyKey:crypto.randomUUID()}]);
  setBody("");setMediaUrl("");setMessage("Added to the batch. No content has been sent.");
 }
 async function saveBatch(){
  if(busy||!batch.length||batch.some(x=>x.workspaceId!==workspaceId))return;
  setBusy(true);setMessage("");let saved=0;let failed=0;
  const remaining:Draft[]=[];
  try{
   for(const draft of batch){
    try{
     const r=await fetch("/api/platform/social/meta/automation",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(draft)});
     const v=await r.json();if(!r.ok||!v.action)throw Error("Draft not saved");
     saved++;
    }catch{failed++;remaining.push(draft);}
   }
   setBatch(remaining);setQueueOpen(true);setMessage(saved+" draft(s) saved for individual approval. "+failed+" remain in the batch with original request IDs for safe retry. Nothing was sent.");
   await refresh();
  }finally{setBusy(false);}
 }
 async function transition(id:string,mode:"approve"|"cancel"){
  if(busy||!window.confirm(mode==="approve"?"Approve this exact content for delivery on its scheduled date? Nothing sends until live delivery is enabled.":"Cancel this scheduled action?"))return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/platform/social/meta/automation",{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({workspaceId,actionId:id,transition:mode,confirm:true})});
   const v=await r.json();if(!r.ok)throw Error(v.error||"Could not change action");
   setMessage(mode==="approve"?"Approved for this selected account and schedule.":"Action canceled.");await refresh();
  }catch(e){setMessage(e instanceof Error?e.message:"Could not change action");}finally{setBusy(false);}
 }
 async function sendOne(a:Action){
  if(busy||!flags.liveWrites||!window.confirm("This will send the approved content to the real Meta account now. Continue?"))return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/platform/social/meta/automation/dispatch",{method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId,actionId:a.id,confirm:true})});
   const v=await r.json();if(!r.ok)throw Error(v.error||"Meta could not confirm the delivery");
   setMessage("Meta confirmed delivery. Receipt "+v.externalRef);await refresh();
  }catch(e){setMessage(e instanceof Error?e.message:"Delivery not confirmed; verify directly with Meta before retrying");await refresh();}
  finally{setBusy(false);}
 }
 function simulate(){
  const due=items.filter(a=>a.status==="approved"&&Date.parse(a.scheduledAt)<=Date.now());
  setSimulation(due.length?due.length+" approved action(s) are due. This simulation made zero external requests.":"No approved actions are due. This simulation made zero external requests.");
 }
 const visible=items.filter(a=>(!connectionId||a.connectionId===connectionId)&&(mode==="inbox"?a.kind.endsWith("_reply"):!a.kind.endsWith("_reply"))&&(queueFilter==="all"||queueFilter==="active"&&["draft","approved","sending","uncertain","blocked"].includes(a.status)||a.status===queueFilter));
 if(mode==="calendar")return <section className="ag-card">{message&&<p role="status">{message}</p>}<MetaSocialCalendar accounts={accounts} items={items} events={events} refresh={()=>void refresh()} busy={busy} loaded={loaded} onPlan={onOpenPosting?(day,id)=>{if(id!=="all")setConnectionId(id);const proposed=new Date(day+"T09:00");setScheduledAt(proposed.getTime()>Date.now()?day+"T09:00":localTime(15));onOpenPosting();}:undefined}/></section>;
 return <section className="ag-card" aria-label="Meta Social automations">
  <div className="ag-platform-bar"><div><h2>{mode==="inbox"?"Social inbox":"Create a post"}</h2>
   <p>{mode==="inbox"?"Review verified incoming interactions and prepare replies.":"Choose an account, write your post, and pick a date. Review saved drafts before approving delivery."}</p></div>
   <button type="button" className="ag-secondary" disabled={busy} onClick={()=>void refresh()}>Refresh</button></div>
  <div className="ag-ws-note">
   <b>{flags.liveWrites?"Live delivery available for explicitly approved actions":"Safe setup mode — no external sending"}</b>
   <p>{flags.scheduled?"Scheduled delivery is enabled.":"Automatic scheduled delivery is not activated."} Incoming webhooks: {flags.webhook?"Verification configured":"Setup required"}.</p>
   <details><summary>Delivery & permission details</summary><p>Connected does not guarantee Meta granted publishing, comments, or messaging permissions. Every delivery rechecks permissions and approved recipients.</p></details>
  </div>
  {message&&<p className="ag-ws-note" role="status">{message}</p>}
  {mode==="inbox"&&account?.provider==="facebook_pages"&&<section className="ag-ws-note"><h3>Messenger activity — read only</h3><p>Read recent conversation activity using existing messaging access. No message bodies, customer names or replies are stored or sent.</p><button type="button" className="ag-secondary" disabled={inboxBusy||account.expired} onClick={()=>void loadInboxActivity()}>{inboxBusy?"Checking Meta…":"Load Messenger activity"}</button>
   {inboxActivity?.connectionId===connectionId&&<div><p><b>{inboxActivity.snapshot.recentConversationCount}</b> recent conversations returned{inboxActivity.snapshot.moreAvailable?" (more available)":""}; unread messages: {inboxActivity.snapshot.unreadMessages??"Unavailable"}</p><small>Checked {new Date(inboxActivity.snapshot.checkedAt).toLocaleString()}; recent sample, not lifetime total.</small><details><summary>Recent activity times</summary>{inboxActivity.snapshot.lastActivity.map((stamp,i)=><p key={stamp+":"+i}>{new Date(stamp).toLocaleString()}</p>)}</details></div>}</section>}
  {!accounts.length?<div className="ag-social-empty">Connect a Facebook Page or Instagram Professional account first.</div>:<>
   <form className="ag-social-form" onSubmit={create}>
    <label>1. Choose a page or profile<select required value={connectionId} onChange={e=>setConnectionId(e.target.value)}>
     {accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.provider==="facebook_pages"?"Facebook":"Instagram"}{a.expired?" (expired)":""}</option>)}
    </select></label>
    <label>2. {mode==="inbox"?"Reply type":"Post format"}<select value={kind} onChange={e=>{setKind(e.target.value as Kind);setTarget("");}}>
     {choices.map(o=><option key={o.kind} value={o.kind}>{o.label}</option>)}
    </select></label>
    {reply&&<label>Incoming interaction<select required value={target} onChange={e=>setTarget(e.target.value)}>
     <option value="">Select a recent verified {targetType}</option>
     {inbound.map(ev=><option key={ev.id} value={targetType==="message"?ev.senderId||"":ev.targetId||""}>{new Date(ev.occurredAt).toLocaleString()} · {targetType==="message"?"Customer message":"Comment"}</option>)}
    </select>{!inbound.length&&<small>Verified incoming {targetType} webhooks are required before replying. No unsolicited messages.</small>}</label>}
    <label>3. {kind==="instagram_photo"?"Photo caption":mode==="inbox"?"Reply":"Post text"}<textarea value={body} maxLength={2200} required rows={4} onChange={e=>setBody(e.target.value)} placeholder="Write your content…" /><small>{body.length}/2200 characters</small></label>
    {needsMedia(kind)&&<label>{kind==="facebook_link"?"Public HTTPS link":"Public HTTPS image URL"}<input required type="url" value={mediaUrl} onChange={e=>setMediaUrl(e.target.value)} placeholder="https://your-site.com/photo.jpg" /><small>{kind==="facebook_link"?"Meta may generate a link preview.":"Meta must be able to fetch this image. Private REACH media links cannot be published directly."}</small></label>}
    <label>4. Scheduled time (local)<input required type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)}/></label>
    <button type="submit" className="ag-primary" disabled={busy||!connectionId||account?.expired}>Save draft — do not send</button>
    {!reply&&<button type="button" className="ag-secondary" disabled={busy||batch.length>=10||!connectionId||account?.expired} onClick={addBatch}>Add to batch</button>}
   </form>
   {mode==="posting"&&<details open={batch.length>0} className="ag-ws-note"><summary>Batch scheduler ({batch.length}/10 drafts)</summary><p>Build a content plan across accounts and dates. Each draft is saved separately and requires approval.</p>
    {batch.map(d=><div key={d.idempotencyKey} className="ag-social-calendar"><div><b>{accounts.find(a=>a.id===d.connectionId)?.name||"Account unavailable"} · {d.kind.replaceAll("_"," ")}</b><small>{new Date(d.scheduledAt).toLocaleString()}</small><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{d.body}</p>{d.mediaUrl&&<small style={{overflowWrap:"anywhere"}}>{d.mediaUrl}</small>}</div><button type="button" disabled={busy} className="ag-secondary" onClick={()=>setBatch(old=>old.filter(x=>x.idempotencyKey!==d.idempotencyKey))}>Remove</button></div>)}
    <button type="button" className="ag-primary" disabled={busy||!batch.length} onClick={()=>void saveBatch()}>Save all as drafts</button>
   </details>}
  </>}
  <details className="ag-ws-note"><summary>Advanced delivery tools</summary><div className="ag-social-actions">
   <button className="ag-secondary" disabled={busy} onClick={simulate}>Simulate due posts (no sending)</button>
   <span className="ag-social-workspace">{items.length} saved action(s)</span>
  </div>
  {simulation&&<p className="ag-ws-note" role="status">{simulation}</p>}</details>
  <details open={queueOpen} onToggle={e=>setQueueOpen(e.currentTarget.open)} className="ag-ws-note"><summary>Saved drafts & delivery queue ({visible.length})</summary><label>Show <select value={queueFilter} onChange={e=>setQueueFilter(e.target.value)}><option value="active">Needs attention / scheduled</option><option value="draft">Drafts</option><option value="approved">Approved</option><option value="sent">Delivered</option><option value="all">All statuses</option></select></label>
  {visible.length===0&&<p className="ag-social-empty">No scheduled actions for this account yet.</p>}
  {visible.map(a=><div className="ag-social-calendar" key={a.id}>
   <div><b>{postStatus(a.status)}</b>
    <small>{new Date(a.scheduledAt).toLocaleString()} · {a.kind.replaceAll("_"," ")}</small>
    <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{a.body}</p>
    <small>Account: {accounts.find(x=>x.id===a.connectionId)?.name||"Unavailable"}</small>
    {a.mediaUrl&&<small style={{overflowWrap:"anywhere"}}>Media / link: {a.mediaUrl}</small>}
    {a.targetId&&<small>Reply target: {a.targetId}</small>}
    {a.externalRef&&<small>Meta receipt: {a.externalRef}</small>}
    {a.errorCode&&<small>Delivery status: {a.errorCode}</small>}
   </div>
   <div className="ag-social-actions">
    {a.status==="draft"&&a.kind.startsWith("facebook_")&&!a.kind.endsWith("_reply")&&<details className="ag-ws-note"><summary>Schedule manually in Meta Business Suite</summary><p>Keep this record as a draft if you schedule it outside REACH. Do not approve it for automatic delivery as well. REACH cannot verify external scheduling or publishing.</p><button type="button" className="ag-secondary" onClick={()=>void copyManual(a.body)}>Copy post text</button>{a.mediaUrl&&<button type="button" className="ag-secondary" onClick={()=>void copyManual(a.mediaUrl!)}>Copy media / link</button>}<a className="ag-secondary" href="https://business.facebook.com/latest/planner" target="_blank" rel="noopener noreferrer">Open Meta planner</a><p>Planned time: {new Date(a.scheduledAt).toLocaleString()}. After manually scheduling, leave as draft or cancel the REACH draft to prevent duplicate delivery.</p></details>}
    {a.status==="draft"&&<button className="ag-secondary" disabled={busy} onClick={()=>void transition(a.id,"approve")}>Approve</button>}
    {["draft","approved"].includes(a.status)&&<button className="ag-secondary" disabled={busy} onClick={()=>void transition(a.id,"cancel")}>Cancel</button>}
    {a.status==="approved"&&flags.liveWrites&&Date.parse(a.scheduledAt)<=Date.now()&&
     <button className="ag-primary" disabled={busy} onClick={()=>void sendOne(a)}>Send approved action now</button>}
   </div>
  </div>)}</details>
  {mode==="inbox"&&<details className="ag-ws-note"><summary>Inbox connection & webhook setup</summary>
   <p>Only messages initiated by customers within the permitted response window can be replied to. Incoming Meta webhooks require verified signatures and account-specific Meta subscriptions. No unsolicited messages or automatic replies are sent by setup alone.</p>
   <p>Callback: <code style={{overflowWrap:"anywhere"}}>{typeof window!=="undefined"?window.location.origin:"https://agency-control-gateway.vercel.app"}/api/platform/social/meta/webhook</code></p>
   <p>Recent verified interactions: {events.length}. Configure the callback and permissions in the Meta developer app to receive them.</p>
  </details>}
 </section>;
}
