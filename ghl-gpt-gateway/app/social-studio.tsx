"use client";
import {useEffect,useState,type FormEvent} from "react";
import {SOCIAL_CHANNELS,type SocialChannel,type SocialState} from "@/lib/social-contract";
type Post={id:string;workspaceId:string;content:string;state:SocialState;channels:string[];scheduledAt:string|null;createdAt:string};
type Workspace={id:string;name:string;slug:string};
type Channel={id:string;name:string;network:string;disabled:boolean};
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
 const [channelsResult,setChannelsResult]=useState<Channel[]>([]);
 const [connected,setConnected]=useState(false);
 const [postizMessage,setPostizMessage]=useState("Postiz not queried");
 const [analytics,setAnalytics]=useState<unknown>(null);
 const [tab,setTab]=useState<"composer"|"calendar"|"insights">("composer");
 useEffect(()=>{
  fetch("/api/platform/workspaces",{credentials:"same-origin",cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||"Workspaces unavailable");return j;}).then(j=>{const list=Array.isArray(j.workspaces)?j.workspaces:[];setWorkspaces(list);setWorkspaceId(list[0]?.id||"");}).catch(e=>setMessage(e.message)).finally(()=>setLoading(false));
 },[]);
 useEffect(()=>{if(workspaceId){void refresh(workspaceId);setChannelsResult([]);setConnected(false);setAnalytics(null);setPostizMessage("Postiz not queried");}else setPosts([]);},[workspaceId]);
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
 async function loadPostiz(analyticsId?:string){
  if(!workspaceId)return;setBusy(true);
  try{
   const params=new URLSearchParams({workspaceId});if(analyticsId)params.set("analytics",analyticsId);
   const r=await fetch("/api/platform/social/postiz?"+params.toString(),{credentials:"same-origin",cache:"no-store"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Postiz unavailable");
   setConnected(j.configured===true);setChannelsResult(j.channels||[]);setAnalytics(j.analytics||null);
   setPostizMessage(j.configured===true?"Postiz organization verified — data read only":"No Postiz staging service or key configured. All publishing disabled.");
  }catch(e){setPostizMessage(e instanceof Error?e.message:"Postiz unavailable");}
  finally{setBusy(false);}
 }
 const selected=workspaces.find(w=>w.id===workspaceId);
 const counts={draft:posts.filter(p=>p.state==="draft").length,planned:posts.filter(p=>p.state==="planned").length,approved:posts.filter(p=>p.state==="approved").length};
 return <div className="ag-social-root">
  <div className="ag-social-top"><div><div className="ag-eyebrow">SOCIAL INTELLIGENCE · ISOLATED STAGING</div><h1>Build better social content.</h1><p>One calm workspace for content, planning, and verified analytics.</p></div><span className="ag-social-safe">● No publishing enabled</span></div>
  <div className="ag-social-toolbar"><label htmlFor="social-workspace">Workspace</label><select id="social-workspace" value={workspaceId} onChange={e=>{setWorkspaceId(e.target.value);reset();}} disabled={busy||loading}>{workspaces.length===0?<option value="">No workspaces created</option>:workspaces.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</select><span className="ag-social-workspace">{selected?.slug||"Staging setup"}</span><button className="ag-secondary" disabled={busy||!workspaceId} onClick={()=>void refresh()}>Refresh</button></div>
  {message&&<p className="ag-ws-note" role="status">{message}</p>}
  {!workspaceId?<section className="ag-card"><h2>No client workspace exists yet</h2><p>Create a synthetic workspace using the Workspaces menu. Social content will be stored there, not in a GHL account.</p></section>:<>
   <div className="ag-social-stats">{[["Draft content",counts.draft,"Edit anytime"],["Planned posts",counts.planned,"Not queued to publish"],["Approved internally",counts.approved,"Not sent"],["Connected Postiz channels",connected?channelsResult.length:"—","Read-only connection"]].map(([label,count,sub])=><div className="ag-metric" key={String(label)}><div><span>{label}</span><i>◈</i></div><strong>{count}</strong><small>{sub}</small></div>)}</div>
   <div className="ag-social-tabs">{[["composer","Content Studio"],["calendar","Publishing Calendar"],["insights","Social Intelligence"]].map(([key,label])=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key as typeof tab)}>{label}</button>)}</div>
   {tab==="composer"&&<div className="ag-social-columns"><section className="ag-card"><h2>{editing?"Edit content":"Create content"}</h2><p>Draft and plan content without connecting a social account.</p>
    <form onSubmit={save} className="ag-social-form"><label>Post content<textarea rows={7} maxLength={3000} required value={content} onChange={e=>setContent(e.target.value)} placeholder="Write a post or start with a clear campaign idea…"/></label><div className="ag-social-count">{content.length}/3000</div><label>Stage<select value={state} onChange={e=>setState(e.target.value as SocialState)}><option value="draft">Draft</option><option value="planned">Planned (not published)</option><option value="approved">Approved for later integration</option></select></label><label>Target date (local time)<input type="datetime-local" value={schedule} onChange={e=>setSchedule(e.target.value)}/></label><fieldset><legend>Channel targets (planning only)</legend><div className="ag-social-channels">{SOCIAL_CHANNELS.map(c=><label key={c}><input type="checkbox" checked={channels.includes(c)} onChange={e=>setChannels(v=>e.target.checked?[...v,c]:v.filter(x=>x!==c))}/>{networkNames[c]}</label>)}</div></fieldset><div className="ag-social-actions"><button className="ag-primary" disabled={busy||!content.trim()}>{busy?"Saving…":editing?"Save changes":"Save in staging"}</button>{editing&&<button type="button" className="ag-secondary" onClick={reset}>Cancel edit</button>}</div></form></section>
   <section className="ag-card"><h2>Content library</h2><p>Everything here remains inside staging.</p><div className="ag-social-list">{posts.length===0?<div className="ag-social-empty">No content yet. Draft your first social post.</div>:posts.map(p=><article key={p.id} className="ag-social-post"><div className="ag-social-post-meta"><span className={"ag-social-post-badge "+p.state}>{p.state}</span><span>{dateHuman(p.scheduledAt)}</span></div><p>{p.content}</p><div className="ag-social-targets">{p.channels.map(c=><span key={c}>{networkNames[c]||c}</span>)}</div><div className="ag-social-actions"><button className="ag-secondary" disabled={busy} onClick={()=>edit(p)}>Edit</button><button className="ag-secondary" disabled={busy} onClick={()=>void remove(p.id)}>Delete</button></div></article>)}</div></section></div>}
   {tab==="calendar"&&<section className="ag-card"><h2>Content planning timeline</h2><p>These are internal scheduling intentions. No job runs and no social network receives a post.</p><div className="ag-social-list">{posts.filter(x=>x.scheduledAt).sort((a,b)=>Date.parse(a.scheduledAt!)-Date.parse(b.scheduledAt!)).map(p=><div className="ag-social-calendar" key={p.id}><div><b>{dateHuman(p.scheduledAt)}</b><small>{p.state.toUpperCase()}</small></div><div><p>{p.content}</p><small>{p.channels.map(x=>networkNames[x]||x).join(", ")||"No channel selected"}</small></div><button className="ag-secondary" onClick={()=>edit(p)}>Edit</button></div>)}{!posts.some(p=>p.scheduledAt)&&<div className="ag-social-empty">No posts scheduled for planning yet.</div>}</div></section>}
   {tab==="insights"&&<section className="ag-card"><div className="ag-platform-bar"><div><h2>Postiz analytics connector</h2><p>Official Postiz endpoints. No synthetic reach or engagement numbers.</p></div><button className="ag-primary" disabled={busy} onClick={()=>void loadPostiz()}>{busy?"Checking…":"Check Postiz staging →"}</button></div><div className="ag-ws-note">{postizMessage}</div><div className="ag-social-insights"><div><h3>Connected channels</h3>{channelsResult.length===0?<p>No verified channels in this workspace.</p>:channelsResult.map(c=><div className="ag-social-calendar" key={c.id}><div><b>{c.name}</b><small>{c.network}</small></div><button className="ag-secondary" disabled={busy||c.disabled} onClick={()=>void loadPostiz(c.id)}>Read analytics</button></div>)}</div><div><h3>Analytics data</h3>{analytics?<pre className="ag-social-analytics">{JSON.stringify(analytics,null,2).slice(0,8000)}</pre>:<div className="ag-social-empty">Metrics appear only when returned by a verified Postiz staging instance. Missing data is not reported as zero.</div>}</div></div></section>}
   <p className="ag-footnote">Social Intelligence staging: drafts and content plans are real database records. No external posting, messaging, GHL scan, import, domain change, or billing is permitted.</p>
  </>}
 </div>;
}
