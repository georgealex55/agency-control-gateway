"use client";
import {useEffect,useRef,useState} from "react";
import MetaAutomationPanel from "./meta-automation-panel";
import styles from "./meta-inbox-panel.module.css";
type Account={id:string;accountId:string;name:string;provider:"facebook_pages"|"instagram_professional";expired:boolean};
type Item={id:string;title?:string|null;date:string|null;count?:number|null;body?:string|null;author?:string|null;direction?:string|null};
type Snapshot={accountId:string;channel:string;rows:Item[];moreAvailable:boolean;checkedAt:string};
const stamp=(v:string|null)=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}):"Time unavailable";
export default function MetaInboxPanel({workspaceId,accounts,channel}:{workspaceId:string;accounts:Account[];channel:"messages"|"comments"}){
 const [selectedId,setSelectedId]=useState(""),[list,setList]=useState<Snapshot|null>(null),[detail,setDetail]=useState<Snapshot|null>(null),[parent,setParent]=useState<Item|null>(null),[filter,setFilter]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const generation=useRef(0);
 const account=accounts.find(a=>a.id===selectedId)||accounts[0];
 const context=workspaceId+":"+account?.id+":"+channel;
 const draftKey=context+":"+parent?.id;
 const draft=drafts[draftKey]||"";
 useEffect(()=>{generation.current++;setList(null);setDetail(null);setParent(null);setBusy(false);setError("");setNotice("");setFilter("");return()=>{generation.current++;};},[context]);
 async function load(item?:Item){
  if(!account||account.expired||!workspaceId||busy)return;
  const run=++generation.current;setBusy(true);setError("");setNotice("");setDetail(null);setParent(item||null);if(!item)setList(null);
  try{
   const q=new URLSearchParams({workspaceId,connectionId:account.id,channel});if(item)q.set("parentId",item.id);
   const r=await fetch("/api/platform/social/meta/inbox?"+q.toString(),{credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(65000)});
   const v=await r.json();if(run!==generation.current)return;
   if(!r.ok||v.workspaceId!==workspaceId||v.connectionId!==account.id||v.channel!==channel||v.parentId!==(item?.id??null)||v.readOnly!==true||v.publishingEnabled!==false||v.snapshot?.source!=="meta_graph_api"||v.snapshot.accountId!==account.accountId||!Array.isArray(v.snapshot.rows))throw Error(v.error||"Provider response unavailable");
   if(item)setDetail(v.snapshot);else setList(v.snapshot);
  }catch(e){if(run===generation.current)setError(e instanceof Error?e.message:"Unable to load provider report");}finally{if(run===generation.current)setBusy(false);}
 }
 async function copyDraft(){try{await navigator.clipboard.writeText(draft);setNotice("Copied. Review the correct conversation or comment in Meta before manually sending.");}catch{setNotice("Clipboard unavailable. Select and copy the draft text manually.");}}
 const messages=channel==="messages",title=messages?"Inbox":"Comments";
 const visible=(list?.rows||[]).filter((row,i)=>(row.title|| (messages?"Conversation "+(i+1):"Post "+(i+1))).toLowerCase().includes(filter.toLowerCase()));
 return <section className={"ag-card "+styles.panel} aria-label={"Social "+title}>
  <header className={styles.header}><div><h2>{title}</h2><p>{messages?"Read customer conversations from the selected profile.":"Review comments on published posts and reels."}</p></div><label>Profile<select value={account?.id||""} onChange={e=>{generation.current++;setSelectedId(e.target.value);setList(null);setDetail(null);setParent(null);}}>{!accounts.length&&<option value="">No profiles</option>}{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.provider==="facebook_pages"?"Facebook":"Instagram"}{a.expired?" (expired)":""}</option>)}</select></label><button type="button" className="ag-primary" disabled={busy||!account||account.expired} onClick={()=>void load()}>{busy&&!parent?"Loading…":messages?"Load conversations":"Load posts"}</button></header>
  <div className={styles.status}><span>Read-only · No messages or comments sent</span><small>{list?"Last loaded "+stamp(list.checkedAt):"Not loaded"}{list?.moreAvailable?" · More items available at Meta":""}</small></div>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  <div className={styles.layout}>
   <aside className={styles.sidebar}><div className={styles.listHead}><b>{messages?"Conversations":"Published posts"}</b><small>{list?list.rows.length+" returned":"—"}</small></div><input aria-label="Filter loaded items" placeholder={messages?"Filter conversations":"Search loaded posts"} value={filter} onChange={e=>setFilter(e.target.value)}/>
    {!list?<p className={styles.empty}>Load {messages?"conversations":"posts"} to begin.</p>:!visible.length?<p className={styles.empty}>No matching items returned.</p>:visible.map(row=><button type="button" key={row.id} disabled={busy} aria-pressed={parent?.id===row.id} className={styles.item} onClick={()=>void load(row)}><strong>{row.title?.slice(0,90)|| (messages?"Conversation "+(list.rows.indexOf(row)+1):"Post "+(list.rows.indexOf(row)+1))}</strong><small>{stamp(row.date)}{row.count!==null&&row.count!==undefined?" · "+row.count+" comments":""}</small></button>)}
   </aside>
   <div className={styles.reader}>{!parent?<div className={styles.empty}>Select a {messages?"conversation":"post"} to view its {messages?"messages":"comments"}.</div>:<>
    <div className={styles.readerHead}><div><b>{parent.title?.slice(0,150)|| (messages?"Conversation":"Selected post")}</b><small>{stamp(parent.date)}</small></div><button type="button" className="ag-secondary" disabled={busy} onClick={()=>void load(parent)}>Refresh</button></div>
    {busy?<p role="status">Loading from Meta…</p>:detail?<div className={styles.thread}>{!detail.rows.length?<p className={styles.empty}>No {messages?"messages":"comments"} returned.</p>:[...detail.rows].sort((a,b)=>(Date.parse(a.date||"")||0)-(Date.parse(b.date||"")||0)).map(row=><article key={row.id} className={styles.bubble} data-outgoing={row.direction==="outgoing"}><div><b>{row.author||(row.direction==="outgoing"?"Business":"Author not returned")}</b><small>{stamp(row.date)}</small></div><p>{row.body??"Text not returned (may be a non-text item)."}</p></article>)}{detail.moreAvailable&&<small>Showing a bounded sample. Open Meta for the full history.</small>}</div>:<p className={styles.empty}>No details loaded.</p>}
    {detail&&<div className={styles.compose}><label>Reply draft (local session only)<textarea rows={3} maxLength={1000} value={draft} onChange={e=>setDrafts(old=>({...old,[draftKey]:e.target.value}))} placeholder="Write a reply to review manually…"/></label><div className={styles.buttons}><button type="button" className="ag-secondary" disabled={!draft.trim()} onClick={()=>void copyDraft()}>Copy draft</button><a className="ag-secondary" href="https://business.facebook.com/latest/inbox/all" target="_blank" rel="noopener noreferrer">Open Meta Inbox ↗</a></div><small>Nothing is queued or sent. For comments, verify the exact comment in Meta before replying.</small>{notice&&<p role="status">{notice}</p>}</div>}
   </>}</div>
  </div>
  <details className={styles.advanced}><summary>Advanced verified reply queue</summary><p>Existing webhook-verified targets and approval safeguards remain separate from manual drafts.</p><MetaAutomationPanel key={workspaceId+":"+account?.id+":"+channel} workspaceId={workspaceId} accounts={account?[account]:[]} mode="inbox"/></details>
  <small>Private conversation content is loaded on demand and held in this view only. No new message or comment storage, read receipts, moderation actions or external delivery.</small>
 </section>;
}
