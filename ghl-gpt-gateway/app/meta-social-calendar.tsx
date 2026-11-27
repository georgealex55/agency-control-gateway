"use client";
import {useState} from "react";
import styles from "./meta-social-calendar.module.css";
type Account={id:string;name:string;provider:string};
type Item={id:string;connectionId:string;kind:string;body:string;status:string;scheduledAt:string};
type Event={id:string;connectionId:string;type:string;occurredAt:string};
const dateKey=(d:Date)=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const first=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),1);
const statusLabel=(s:string)=>({draft:"Draft",approved:"Approved",sending:"Sending",sent:"Delivered",uncertain:"Needs review",blocked:"Blocked",canceled:"Canceled"} as Record<string,string>)[s]||s;
export default function MetaSocialCalendar({accounts,items,events,refresh,busy,loaded}:{accounts:Account[];items:Item[];events:Event[];refresh:()=>void;busy:boolean;loaded:boolean}){
 const [month,setMonth]=useState(()=>first(new Date()));
 const [day,setDay]=useState(()=>dateKey(new Date()));
 const [account,setAccount]=useState("all");
 const [includeEvents,setIncludeEvents]=useState(false);
 const scoped=(id:string)=>(account==="all"||id===account)&&accounts.some(a=>a.id===id);
 const entries=[...items.filter(a=>scoped(a.connectionId)&&!a.kind.endsWith("_reply")&&a.status!=="canceled").map(a=>({id:"post:"+a.id,accountId:a.connectionId,at:a.scheduledAt,title:a.body,kind:a.kind.replaceAll("_"," "),status:statusLabel(a.status),event:false})),
  ...(includeEvents?events.filter(e=>scoped(e.connectionId)).map(e=>({id:"event:"+e.id,accountId:e.connectionId,at:e.occurredAt,title:e.type==="message"?"Customer message":"Customer comment",kind:"Verified inbound event",status:"Received",event:true})):[])].filter(e=>Number.isFinite(Date.parse(e.at))).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const offset=month.getDay(),start=new Date(month.getFullYear(),month.getMonth(),1-offset);
 const dates=Array.from({length:42},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));
 const active=entries.filter(e=>dateKey(new Date(e.at))===day);
 function shift(delta:number){const d=new Date(month.getFullYear(),month.getMonth()+delta,1);setMonth(d);setDay(dateKey(d));}
 return <div className={styles.calendar}>
  <div className={styles.tools}><div><h2>Social calendar</h2><p>Saved scheduled posts and optional verified incoming events. Times use your local timezone.</p></div><button className="ag-secondary" disabled={busy} onClick={refresh}>Refresh</button></div>
  <div className={styles.tools}><label>Account <select value={account} onChange={e=>setAccount(e.target.value)}><option value="all">All connected accounts</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.provider==="facebook_pages"?"Facebook":"Instagram"}</option>)}</select></label><label><input type="checkbox" checked={includeEvents} onChange={e=>setIncludeEvents(e.target.checked)}/> Show verified customer events</label></div>
  <div className={styles.tools}><button className="ag-secondary" onClick={()=>shift(-1)} aria-label="Previous month">‹</button><h3>{month.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</h3><button className="ag-secondary" onClick={()=>shift(1)} aria-label="Next month">›</button><button className="ag-secondary" onClick={()=>{setMonth(first(new Date()));setDay(dateKey(new Date()));}}>Today</button></div>
  <div className={styles.scroll}><div className={styles.grid}>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div className={styles.weekday} key={d}>{d}</div>)}
   {dates.map(d=>{const key=dateKey(d),matches=entries.filter(e=>dateKey(new Date(e.at))===key);return <button type="button" key={key} className={styles.day+(d.getMonth()!==month.getMonth()?" "+styles.other:"")} aria-pressed={day===key} aria-label={d.toLocaleDateString()+" · "+matches.length+" entries"} onClick={()=>setDay(key)}><strong>{d.getDate()}</strong>{matches.slice(0,2).map(e=><span key={e.id} className={styles.chip} data-event={e.event}>{e.status} · {accounts.find(a=>a.id===e.accountId)?.name||"Account"}</span>)}{matches.length>2&&<small>+{matches.length-2} more</small>}</button>;})}
  </div></div>
  <section><h3>{new Date(day+"T12:00:00").toLocaleDateString(undefined,{dateStyle:"full"})}</h3>{!loaded?<p>Calendar data is not available yet.</p>:!active.length?<p>No saved entries for this day.</p>:active.map(e=><article className={styles.entry} key={e.id}><b>{new Date(e.at).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})} · {accounts.find(a=>a.id===e.accountId)?.name} · {e.status}</b><small>{e.kind}</small><p>{e.title}</p></article>)}</section>
  <small>Calendar covers the latest 100 saved actions and 30 verified inbound events returned by REACH. Drafts are not approved posts. Provider-native scheduled posts and Facebook Events are not yet imported.</small>
 </div>;
}
