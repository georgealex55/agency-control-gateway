"use client";
import {useState,useRef,useEffect} from "react";
import type {MetaAnalyticsSnapshot} from "@/lib/social-meta-analytics";
import {observed,profilePerformance,ranked,dedupeAssets,publishingActivity,contentGroups,priorityNotes,type ProfileScan} from "@/lib/social-intelligence-summary";
import styles from "./meta-intelligence-panel.module.css";
type Account={id:string;accountId:string;name:string;provider:"facebook_pages"|"instagram_professional";expired:boolean};
type Row=Record<string,unknown>;
type Inventory={rows:Row[];moreAvailable:boolean};
type Extra={grantedPermissions:string[];reports:{feature:string;status:string;missing:string[];inventory:Inventory|null;details:{assetId:string;status:string;data:Inventory|null}[]}[];inbox:{status:string;data:{recentConversationCount:number;unreadMessages:number|null;moreAvailable:boolean}|null};trends:{status:string;data:{name:string;points:{date:string;value:number}[];status:string}[]|null};checkedAt:string};
type Scan=ProfileScan&{extras:Extra|null;errors:string[]};
const fmt=(n:number|null|undefined)=>n===null||n===undefined?"Unavailable":n.toLocaleString(undefined,{maximumFractionDigits:2});
const metricName=(name:string)=>({page_media_view:"Facebook content views",page_total_media_view_unique:"Facebook unique viewers",page_total_actions:"Page action clicks",reach:"Accounts reached",views:"Views",accounts_engaged:"Accounts engaged",total_interactions:"Interactions",profile_views:"Profile views",profile_links_taps:"Profile link taps",content_views:"Content views",follower_count:"Follower count",likes:"Likes",comments:"Comments",shares:"Shares",saves:"Saves",replies:"Replies"} as Record<string,string>)[name]||name.replaceAll("_"," ");
const display=(v:unknown)=>typeof v==="number"?fmt(v):typeof v==="string"?v:"Unavailable";
function Bars({rows,label}:{rows:{name:string;value:number|null}[];label:string}){
 const max=Math.max(1,...rows.map(x=>x.value??0));
 return <div className={styles.bars} role="group" aria-label={label}>{rows.map((r,i)=><div className={styles.barRow} key={i}><span>{r.name}</span><div className={styles.track}>{r.value!==null&&<div className={styles.fill} style={{width:100*r.value/max+"%"}}/>}</div><b>{fmt(r.value)}</b></div>)}</div>;
}
function Trend({points,label}:{points:{date:string;value:number}[];label:string}){
 const max=Math.max(1,...points.map(p=>p.value));
 return <div className={styles.trend}><h4>{label}</h4>{points.length?<><div className={styles.spark} role="img" aria-label={label+" daily values"}>{points.map((p,i)=><div key={i} title={p.date+": "+fmt(p.value)} style={{height:Math.max(2,100*p.value/max)+"%"}}/>)}</div><small>{points[0].date.slice(0,10)} – {points[points.length-1].date.slice(0,10)} · {points.length} returned days</small><details><summary>Daily values</summary><Bars label={label+" daily values"} rows={points.map(p=>({name:p.date.slice(0,10),value:p.value}))}/></details></>:<p>Not returned by Meta.</p>}</div>;
}
export default function MetaIntelligencePanel({workspaceId,accounts,onSnapshots}:{workspaceId:string;accounts:Account[];onSnapshots:(v:Record<string,MetaAnalyticsSnapshot>)=>void}){
 const [scans,setScans]=useState<Scan[]>([]),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[total,setTotal]=useState(0),[checked,setChecked]=useState(""),[limit,setLimit]=useState("25");
 const generation=useRef(0);
 useEffect(()=>{generation.current++;setScans([]);setBusy(false);setChecked("");setProgress(0);return()=>{generation.current++;};},[workspaceId]);
 async function scanAll(){
  if(busy||!workspaceId)return;
  const selected=accounts.filter(a=>!a.expired).slice(0,12);
  const run=++generation.current;setBusy(true);setScans([]);setChecked("");setProgress(0);setTotal(selected.length);
  const results:Scan[]=[];
  async function fetchReport(a:Account,path:string,params:Record<string,string>={}){
   const q=new URLSearchParams({workspaceId,connectionId:a.id,...params});
   const r=await fetch("/api/platform/social/meta/"+path+"?"+q.toString(),{credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(65000)});
   const v=await r.json();
   if(!r.ok||v.workspaceId!==workspaceId||v.connectionId!==a.id||v.publishingEnabled!==false)throw Error(v.error||"Report unavailable");
   return v;
  }
  async function one(a:Account){
   const entry:Scan={id:a.id,name:a.name,provider:a.provider,snapshot:null,extras:null,errors:[]};
   const [profile,extra]=await Promise.allSettled([fetchReport(a,"analytics",{limit,detail:"1",expanded:"1"}),fetchReport(a,"intelligence")]);
   if(profile.status==="fulfilled"&&profile.value.metricsAreReal===true&&profile.value.snapshot?.source==="meta_graph_api"&&profile.value.snapshot.accountId===a.accountId)entry.snapshot=profile.value.snapshot;
   else entry.errors.push("Profile: "+(profile.status==="rejected"&&profile.reason instanceof Error?profile.reason.message:"Unverified response"));
   if(extra.status==="fulfilled"&&extra.value.source==="meta_graph_api"&&extra.value.readOnly===true)entry.extras=extra.value;
   else entry.errors.push("Business tools: "+(extra.status==="rejected"&&extra.reason instanceof Error?extra.reason.message:"Unverified response"));
   if(run!==generation.current)return;
   results.push(entry);setScans([...results]);setProgress(results.length);
  }
  try{
   for(let i=0;i<selected.length;i+=2){if(run!==generation.current)return;await Promise.all(selected.slice(i,i+2).map(one));}
   if(run===generation.current){onSnapshots(Object.fromEntries(results.filter(x=>x.snapshot).map(x=>[x.id,x.snapshot!])));setChecked(new Date().toISOString());}
  }finally{if(run===generation.current)setBusy(false);}
 }
 const current=scans.filter(s=>accounts.some(a=>a.id===s.id&&!a.expired));
 const metrics=current.map(profilePerformance),valid=metrics.filter(x=>x.snapshot);
 const followers=observed(metrics.map(x=>x.followers)),views=observed(metrics.map(x=>x.views)),reach=observed(metrics.map(x=>x.reach));
 const observedInteractions=observed(metrics.map(x=>x.interactions.value));
 const notes=priorityNotes(current);
 const postRank=ranked(current.flatMap(p=>(p.snapshot?.recentPosts||[]).filter(x=>x.likes!==null&&x.comments!==null).map(post=>({name:p.name,post,value:post.likes!+post.comments!}))),r=>r.value).slice(0,10);
 const ads=dedupeAssets(current.flatMap(s=>(s.extras?.reports||[]).filter(r=>r.feature==="ads").flatMap(r=>r.details.filter(d=>d.data).map(d=>({...d,name:String(r.inventory?.rows.find(x=>x.id===d.assetId)?.name||d.assetId)})))));
 const leadForms=dedupeAssets(current.flatMap(s=>(s.extras?.reports||[]).filter(r=>r.feature==="leads").flatMap(r=>r.details.filter(d=>d.data).map(d=>({...d,name:String(r.inventory?.rows.find(x=>x.id===d.assetId)?.name||d.assetId)})))));
 const businesses=new Map(current.flatMap(s=>(s.extras?.reports||[]).filter(r=>r.feature==="businesses").flatMap(r=>(r.inventory?.rows||[]).map(row=>[String(row.id),row] as const))));
 return <section className={"ag-card "+styles.panel} aria-label="Unified social intelligence">
  <header className={styles.header}><div><div className={styles.kicker}>SOCIAL MEDIA INTELLIGENCE</div><h2>All profiles. One performance picture.</h2><p>Scan connected profiles and permitted business assets together. No publishing, messaging or account changes.</p></div><div className={styles.controls}><label>Recent posts per profile <select value={limit} disabled={busy} onChange={e=>setLimit(e.target.value)}>{["10","25","50"].map(n=><option key={n}>{n}</option>)}</select></label><button className="ag-primary" disabled={busy||!accounts.some(a=>!a.expired)} onClick={()=>void scanAll()}>{busy?"Scanning "+progress+"/"+total:"Scan all profiles"}</button></div></header>
  <p className={styles.muted}>{accounts.filter(a=>!a.expired).length} active profiles · {accounts.filter(a=>a.expired).length} expired · maximum 12 profiles per scan, up to 3 ad accounts and 3 lead forms per authorization. {checked?"Last scan "+new Date(checked).toLocaleString():"No scan completed yet."}</p>
  {busy&&<progress aria-label="Profile scan progress" max={total||1} value={progress}/>}
  {!current.length&&!busy?<p className="ag-social-empty">Run a scan to populate the dashboard with actual provider data.</p>:<>
   <div className={styles.kpis}>{[["Followers (sum, not unique people)",followers.value,followers.known],["Account views (provider windows)",views.value,views.known],["Reach / unique viewers (not deduplicated)",reach.value,reach.known],["Loaded post likes/reactions + comments",observedInteractions.value,observedInteractions.known],["Posts loaded",valid.length?valid.reduce((a,p)=>a+p.posts,0):null,valid.length],["Profiles reporting",valid.length,current.length]].map(([name,v,known])=><div key={String(name)} className={styles.kpi}><small>{name}</small><strong>{fmt(v as number|null)}</strong><span>{known}/{current.length} profiles reported</span></div>)}</div>
   <p className={styles.muted}>Account exposure windows can differ by provider. Loaded post metrics are lifetime observations, not 28-day account totals. Missing values are never zero; follower and exposure sums can include the same people.</p>
   <div className={styles.grid}><article><h3>Audience ranking</h3><Bars label="Followers by profile" rows={ranked(metrics,m=>m.followers).map(m=>({name:m.name,value:m.followers}))}/></article><article><h3>Observed engagement ranking</h3><p className={styles.muted}>Average likes/reactions + comments per complete loaded post. Sample sizes shown.</p><Bars label="Average observed engagement" rows={ranked(metrics,m=>m.avg).map(m=>({name:m.name+" ("+m.completePosts+" posts)",value:m.avg}))}/></article><article><h3>Account exposure by profile</h3><Bars label="Reported views" rows={metrics.map(m=>({name:m.name+" · views",value:m.views}))}/><Bars label="Reported reach or unique viewers" rows={metrics.map(m=>({name:m.name+" · reach / viewers",value:m.reach}))}/></article><article><h3>Content format performance</h3><Bars label="Average observed engagement per format" rows={ranked(contentGroups(current),g=>g.avg).map(g=>({name:g.format+" ("+g.complete+"/"+g.posts+")",value:g.avg}))}/></article></div>
   <h3>Publishing activity — previous 28 complete UTC days</h3>{valid.length>0?<Trend label="Loaded posts per day (sample only)" points={publishingActivity(current).map(x=>({date:x.date,value:x.count}))}/>:<p>No profile reports available.</p>}<p className={styles.muted}>Days with zero loaded posts are not proof that nothing was published; older posts may be outside the sample.</p>
   <h3>What needs attention</h3>{notes.length?notes.map((n,i)=><div className={styles.note} key={i}><b>{n.priority} · {n.name}</b><p>{n.text}</p></div>):<p>No rule-based issues identified in the loaded sample.</p>}
   {current.map(s=>s.extras?.inbox.data&&s.extras.inbox.data.unreadMessages!==null&&s.extras.inbox.data.unreadMessages>0?<div key={s.id} className={styles.note}><b>Action · {s.name}</b><p>{fmt(s.extras.inbox.data.unreadMessages)} unread messages reported. Review the inbox.</p></div>:null)}
   <h3>Profile intelligence and permission coverage</h3>
   {metrics.map(m=><details className={styles.profile} key={m.id} open><summary>{m.name} · {m.provider==="facebook_pages"?"Facebook":"Instagram"} · {m.snapshot?"Profile loaded":"Profile unavailable"}</summary>
    {m.errors.map((e,i)=><p role="status" key={i}>{e}</p>)}
    <div className={styles.kpis}>{[["Followers",m.followers],["Posts sampled",m.snapshot?m.posts:null],["Reactions / likes",m.reactions.value],["Comments",m.comments.value],["Shares",m.shares.value],["Average observed engagement",m.avg],["Avg. interactions / followers (%)",m.rate]].map(([k,v])=><div className={styles.kpi} key={String(k)}><small>{k}</small><strong>{fmt(v as number|null)}</strong></div>)}</div>
    <p className={styles.muted}>Complete likes/comments: {m.completePosts}/{m.posts}; share coverage: {m.shares.known}/{m.shares.total}. Follower-normalized ratio is a sample proxy, not Meta's reach-based engagement rate.</p>
    {m.snapshot?.accountInsights&&<><h4>Provider account insights</h4><p>{m.snapshot.accountInsights.period} · {m.snapshot.accountInsights.status}</p><Bars label={m.name+" account insight totals"} rows={m.snapshot.accountInsights.metrics.map(x=>({name:metricName(x.name),value:x.value}))}/></>}
    {(m.extras?.trends.data||[]).map(t=><Trend key={t.name} label={metricName(t.name)} points={t.points}/>)}
    {m.extras&&<><p>Messenger: {m.extras.inbox.status.replaceAll("_"," ")}{m.extras.inbox.data?" · "+m.extras.inbox.data.recentConversationCount+" recent conversations · "+fmt(m.extras.inbox.data.unreadMessages)+" unread":""}</p>
     {m.extras.reports.map(r=><div className={styles.note} key={r.feature}><b>{metricName(r.feature)} · {r.status.replaceAll("_"," ")}</b><p>{r.inventory?r.inventory.rows.length+" assets returned"+(r.inventory.moreAvailable?" (more available)":""):r.missing.length?"Missing: "+r.missing.join(", "):"Provider did not return this report."}</p>{r.details.filter(d=>d.status!=="available").map(d=><small key={d.assetId}>Details unavailable for asset {d.assetId}. </small>)}</div>)}
     <details><summary>{m.extras.grantedPermissions.length} verified permissions</summary><p className={styles.muted}>{m.extras.grantedPermissions.join(", ")}</p></details></>}
   </details>)}
   <h3>Top observed posts</h3>{postRank.length?<div className={styles.grid}>{postRank.map((r,i)=><article key={i}><b>#{i+1} · {r.name}</b><p>{(r.post.caption||"No caption").slice(0,180)}</p><strong>{fmt(r.value)} likes/reactions + comments</strong><p className={styles.muted}>{r.post.format||"Unknown format"} · {r.post.createdAt?.slice(0,10)||"Unknown date"}</p>{r.post.link&&<a href={r.post.link} target="_blank" rel="noopener noreferrer">View original</a>}</article>)}</div>:<p>No complete observed engagement data.</p>}
   <h3>Advertising — separate from organic exposure</h3><p className={styles.muted}>30-day reports, deduplicated by ad account ID. Accessible ads are not necessarily attributable to the selected Page. Currency is never combined.</p>{ads.length?ads.map(a=><article className={styles.profile} key={a.assetId}><b>{a.name}</b>{a.data?.rows.map((row,i)=>{const spend=typeof row.spend==="string"?Number(row.spend):null,impressions=typeof row.impressions==="number"?row.impressions:null,clicks=typeof row.clicks==="number"?row.clicks:null;return <div key={i} className={styles.kpis}>{[["Spend ("+display(row.currency)+")",spend],["Impressions",impressions],["Reach",row.reach],["Clicks",clicks],["CTR (%)",clicks!==null&&impressions!==null&&impressions>0?100*clicks/impressions:null],["CPC",spend!==null&&clicks!==null&&clicks>0?spend/clicks:null],["CPM",spend!==null&&impressions!==null&&impressions>0?1000*spend/impressions:null]].map(([k,v])=><div className={styles.kpi} key={String(k)}><small>{String(k)}</small><strong>{display(v)}</strong></div>)}</div>})}</article>):<p>No advertising details returned.</p>}
   <h3>Lead forms and businesses</h3><p>{businesses.size} distinct business portfolios returned in available reports. Not a complete inventory.</p>{leadForms.map(f=><div className={styles.note} key={f.assetId}><b>{f.name}</b><p>{f.data?.rows.length??"Unavailable"} recent submissions returned{f.data?.moreAvailable?" (more available)":""}. No contact fields collected.</p></div>)}
   <p className={styles.muted}>Rankings compare your own connected profiles and loaded content, not competitors or market position. Scan data is held in this session; no historical growth baseline or automated actions are created.</p>
  </>}
 </section>;
}
