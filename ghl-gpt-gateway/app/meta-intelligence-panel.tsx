"use client";
import {useState,useRef,useEffect} from "react";
import type {MetaAnalyticsSnapshot} from "@/lib/social-meta-analytics";
import {observed,profilePerformance,ranked,publishingActivity,contentGroups,priorityNotes,profileHealth,type ProfileScan} from "@/lib/social-intelligence-summary";
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
export default function MetaIntelligencePanel({workspaceId,accounts,snapshots,onSnapshots}:{workspaceId:string;accounts:Account[];snapshots:Record<string,MetaAnalyticsSnapshot>;onSnapshots:(v:Record<string,MetaAnalyticsSnapshot>)=>void}){
 const [scans,setScans]=useState<Scan[]>([]),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[total,setTotal]=useState(0),[checked,setChecked]=useState(""),[limit,setLimit]=useState("25");
 const [selectedId,setSelectedId]=useState("");
 const [scanScope,setScanScope]=useState<"profile"|"all">("profile");
 const account=accounts.find(a=>a.id===selectedId)||accounts[0];
 const generation=useRef(0);
 useEffect(()=>{generation.current++;setScans([]);setBusy(false);setChecked("");setProgress(0);return()=>{generation.current++;};},[workspaceId]);
 async function scanAll(scope:"profile"|"all"){
  if(busy||!workspaceId)return;
  const selected=accounts.filter(a=>!a.expired&&(scope==="all"||a.id===account?.id)).slice(0,12);
  if(!selected.length)return;
  setScanScope(scope);
  const run=++generation.current;setBusy(true);setScans(old=>old.filter(s=>!selected.some(a=>a.id===s.id)));setChecked("");setProgress(0);setTotal(selected.length);
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
   results.push(entry);setScans(old=>[...old.filter(s=>s.id!==entry.id),entry]);setProgress(results.length);
  }
  try{
   for(let i=0;i<selected.length;i+=2){if(run!==generation.current)return;await Promise.all(selected.slice(i,i+2).map(one));}
   if(run===generation.current){onSnapshots(Object.fromEntries(results.filter(x=>x.snapshot).map(x=>[x.id,x.snapshot!])));setChecked(new Date().toISOString());}
  }finally{if(run===generation.current)setBusy(false);}
 }
 const current=scans.filter(s=>accounts.some(a=>a.id===s.id&&!a.expired));
 const scanned=current.find(s=>s.id===account?.id);
 const data=account&&!account.expired?(scanned?scanned.snapshot:snapshots[account.id]?.accountId===account.accountId?snapshots[account.id]:null):null;
 const selected:Scan|null=account?{id:account.id,name:account.name,provider:account.provider,snapshot:data||null,extras:scanned?.extras||null,errors:scanned?.errors||[]}:null;
 const m=selected?profilePerformance(selected):null;
 const health=scanned?profileHealth(scanned,scanned.extras?.inbox.data?.unreadMessages??null):[];
 const counts=health.reduce((a,h)=>({...a,[h.status]:a[h.status]+1}),{observed:0,attention:0,unknown:0});
 const notes=scanned?priorityNotes([scanned]):[];
 const metrics=current.map(profilePerformance);
 const groups=selected?contentGroups([selected]):[];
 const postRank=ranked((data?.recentPosts||[]).filter(x=>x.likes!==null&&x.comments!==null).map(post=>({post,value:post.likes!+post.comments!})),r=>r.value).slice(0,10);
 const extras=selected?.extras;
 const rows:[string,number|null|undefined][]=[["Followers",m?.followers],["Views",m?.views],["Reach / unique viewers",m?.reach],["Likes / reactions",m?.reactions.value],["Comments",m?.comments.value],["Shares",m?.shares.value],["Avg. engagement / post",m?.avg],["Posts loaded",data?m?.posts:null]];
 const complete=health.length>0&&counts.unknown===0;
 const healthLabel=!scanned?.snapshot?"Insufficient data":counts.attention?"Needs attention":complete?"No flagged issues":"Limited visibility";
 return <section className={"ag-card "+styles.panel} aria-label="Unified social intelligence">
  <header className={styles.header}><div><div className={styles.kicker}>SOCIAL ANALYTICS</div><h2>Profile overview</h2><p className={styles.muted}>Choose a profile. Scan individually or refresh all connected profiles.</p></div></header>
  <div className={styles.selector}><label>Profile<select value={account?.id||""} onChange={e=>setSelectedId(e.target.value)}>{!accounts.length&&<option value="">No connected profiles</option>}{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.provider==="facebook_pages"?"Facebook":"Instagram"}{a.expired?" (expired)":""}</option>)}</select></label><div className={styles.controls}><button className="ag-primary" disabled={busy||!account||account.expired} onClick={()=>void scanAll("profile")}>Scan profile</button><button className="ag-secondary" disabled={busy||!accounts.some(a=>!a.expired)} onClick={()=>void scanAll("all")}>Scan all profiles</button></div></div>
  <div className={styles.scanLine}><small>{account?.expired?"Authorization expired":scanned?.snapshot?"Profile scanned "+new Date(scanned.snapshot.checkedAt).toLocaleString():data?"Last loaded "+new Date(data.checkedAt).toLocaleString():scanned?"Scan returned no profile metrics":"No profile metrics loaded"}</small><label>Posts per scan <select value={limit} disabled={busy} onChange={e=>setLimit(e.target.value)}>{["10","25","50"].map(n=><option key={n}>{n}</option>)}</select></label></div>
  {busy&&<div role="status"><small>{scanScope==="all"?"Scanning all profiles":"Scanning selected profile"} · {progress}/{total}</small><progress aria-label="Profile scan progress" max={total||1} value={progress}/></div>}
  <div className={styles.kpis}>{rows.map(([name,value])=><div key={name} className={styles.kpi}><small>{name}</small><strong>{fmt(value)}</strong></div>)}</div>
  {data&&<p className={styles.muted}>{data.accountInsights?.period||"Account insights unavailable"} · Post figures are observed lifetime counts on loaded posts, not period totals. Missing values are not zero.</p>}
  {!data&&!busy&&<p className={styles.muted}>Scan the selected profile to load real numbers.</p>}
  {scanned&&<section className={styles.health} aria-label="Selected profile health"><div className={styles.healthHead}><div><h3>Profile health</h3><p className={styles.muted}>Rule-based assessment of {account?.name}, not a platform score or competitor benchmark.</p></div><strong data-state={counts.attention?"attention":counts.unknown?"unknown":"observed"}>{healthLabel}</strong></div>
   <div className={styles.healthBody}><div className={styles.ring} role="img" aria-label={counts.observed+" observed, "+counts.attention+" attention, "+counts.unknown+" unknown checks"} style={{background:"conic-gradient(#389b83 0 "+counts.observed*20+"%,#d69a42 "+counts.observed*20+"% "+(counts.observed+counts.attention)*20+"%,#858996 "+(counts.observed+counts.attention)*20+"% 100%)"}}><div><strong>{counts.observed}/{health.length}</strong><small>checks observed</small></div></div><div className={styles.dimensions}>{health.map(h=><div key={h.name}><span className={styles.dot} data-state={h.status}/><div><b>{h.name}</b><small>{h.detail}</small></div><span className={styles.state}>{h.status==="observed"?"Observed":h.status==="attention"?"Attention":"Unknown"}</span></div>)}</div></div>
   <div className={styles.recommendations}><h4>What to do next</h4>{notes.length?notes.map((n,i)=><p key={i}><b>{n.priority}:</b> {n.text}</p>):<p>No additional rule-based issues identified.</p>}{extras?.inbox.data&&extras.inbox.data.unreadMessages!==null&&extras.inbox.data.unreadMessages>0&&<p><b>Action:</b> Review {fmt(extras.inbox.data.unreadMessages)} unread messages.</p>}{selected?.errors.map((e,i)=><p key={i} role="status">{e}</p>)}</div>
  </section>}
  {data&&<><div className={styles.grid}>{(extras?.trends.data||[]).filter(t=>t.points.length).map(t=><Trend key={t.name} label={metricName(t.name)} points={t.points}/>)}<Trend label="Publishing activity · last 28 complete UTC days (loaded sample)" points={publishingActivity([selected!])}/></div><p className={styles.muted}>Zero loaded posts on a day does not establish that no posts were published.</p>
   <details className={styles.detail}><summary>All profile metrics and coverage</summary><Bars label="Account insights" rows={(data.accountInsights?.metrics||[]).map(x=>({name:metricName(x.name),value:x.value}))}/><div className={styles.kpis}>{[["Total media",data.totalPosts],["Observed engagement",m?.interactions.value],["Avg. engagement / followers (%)",m?.rate],["Post views (observed sum)",observed(data.recentPosts.map(x=>x.views)).value],["Post saves (observed sum)",observed(data.recentPosts.map(x=>x.saves)).value],["Post interactions (observed sum)",observed(data.recentPosts.map(x=>x.interactions)).value]].map(([k,v])=><div className={styles.kpi} key={String(k)}><small>{k}</small><strong>{fmt(v as number|null)}</strong></div>)}</div><p className={styles.muted}>Complete engagement: {m?.completePosts}/{m?.posts} posts. Detailed insights: {data.detailCoverage}/{data.recentPosts.length}. Follower-normalized engagement is a proxy, not a provider rate.</p></details>
   <details className={styles.detail}><summary>Content performance and top posts</summary><Bars label="Average observed engagement per format" rows={ranked(groups,g=>g.avg).map(g=>({name:g.format+" ("+g.complete+"/"+g.posts+")",value:g.avg}))}/>{postRank.map((r,i)=><div className={styles.note} key={r.post.id}><b>#{i+1} · {fmt(r.value)} likes/reactions + comments</b><p>{(r.post.caption||"No caption").slice(0,180)}</p>{r.post.link&&<a href={r.post.link} target="_blank" rel="noopener noreferrer">View original</a>}</div>)}</details></>}
  {extras&&<details className={styles.detail}><summary>Advertising, leads, business assets and permissions</summary><p className={styles.muted}>Assets accessible through this authorization may not belong to this Page. Paid results are separate from organic exposure.</p>{extras.reports.map(r=><div key={r.feature} className={styles.note}><b>{metricName(r.feature)} · {r.status.replaceAll("_"," ")}</b><p>{r.inventory?r.inventory.rows.length+" assets returned"+(r.inventory.moreAvailable?" (more available)":""):r.missing.length?"Missing: "+r.missing.join(", "):"Report unavailable"}</p>{r.details.map(d=><div key={d.assetId}><b>{display(r.inventory?.rows.find(x=>x.id===d.assetId)?.name||d.assetId)}</b>{d.data?r.feature==="ads"?d.data.rows.map((row,i)=>{const spend=typeof row.spend==="string"?Number(row.spend):null,impressions=typeof row.impressions==="number"?row.impressions:null,clicks=typeof row.clicks==="number"?row.clicks:null;return <p key={i}>Spend {display(row.spend)} {display(row.currency)} · Impressions {display(impressions)} · Reach {display(row.reach)} · Clicks {display(clicks)} · CTR {fmt(clicks!==null&&impressions!==null&&impressions>0?100*clicks/impressions:null)}% · CPC {fmt(spend!==null&&clicks!==null&&clicks>0?spend/clicks:null)} · CPM {fmt(spend!==null&&impressions!==null&&impressions>0?1000*spend/impressions:null)}</p>}):<p>{d.data.rows.length} recent submissions{d.data.moreAvailable?" (more available)":""}</p>:<p>Details unavailable</p>}</div>)}</div>)}<p>Messenger: {extras.inbox.status.replaceAll("_"," ")}{extras.inbox.data?" · "+extras.inbox.data.recentConversationCount+" recent conversations · "+fmt(extras.inbox.data.unreadMessages)+" unread":""}</p><p className={styles.muted}>{extras.grantedPermissions.length} verified permissions: {extras.grantedPermissions.join(", ")}</p></details>}
  {current.length>1&&<details className={styles.detail}><summary>Compare scanned profiles ({current.length})</summary><Bars label="Followers by profile" rows={ranked(metrics,x=>x.followers).map(x=>({name:x.name,value:x.followers}))}/><Bars label="Average observed likes/reactions and comments" rows={ranked(metrics,x=>x.avg).map(x=>({name:x.name+" ("+x.completePosts+" posts)",value:x.avg}))}/><p className={styles.muted}>Internal comparisons only; no external benchmark. Reports retained during this session.</p></details>}
  <small className={styles.muted}>{checked?"Last scan completed "+new Date(checked).toLocaleString()+". ":""}Up to 12 active profiles per total scan; up to 3 ad accounts and 3 lead forms per authorization. Read only.</small>
 </section>;
}
