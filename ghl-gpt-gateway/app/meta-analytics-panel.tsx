"use client";
import {useState} from "react";
import type {MetaAnalyticsSnapshot,MetaPostMetric} from "@/lib/social-meta-analytics";
import styles from "./meta-analytics-panel.module.css";
import {groupPostFormats,metricSummary,postActivity,type MetricKey} from "@/lib/social-report-summary";
type Account={id:string;name:string;provider:"facebook_pages"|"instagram_professional";expired:boolean};
type Sort="newest"|"likes"|"comments"|"shares"|"views";
const label=(v:string|null)=>(({PHOTO:"Photo",VIDEO:"Video",REEL:"Reel",CAROUSEL:"Carousel",TEXT:"Text",LINK:"Link",STORY:"Story"} as Record<string,string>)[v||""]||"Unclassified");
const number=(v:number|null|undefined)=>typeof v==="number"?v.toLocaleString():"—";
const time=(s:string|null)=>s&&Number.isFinite(Date.parse(s))?new Date(s).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}):"Date unavailable";
function Stats({items}:{items:[string,number|null|undefined][]}){return <div className={styles.stats}>{items.map(([name,v])=><div key={name} className={styles.stat}><span>{name}</span><strong>{number(v)}</strong></div>)}</div>;}
function Preview({post}:{post:MetaPostMetric}){
 const [failed,setFailed]=useState<string[]>([]);
 const images=(post.previewImages||[]).filter(src=>!failed.includes(src));
 if(!images.length)return null;
 return <div className={images.length>1?styles.gallery:styles.single}>{images.map((src,i)=><img key={src} src={src} alt={label(post.format)+" preview "+(i+1)} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(old=>[...old,src])}/>)}</div>;
}
function PostCard({post,facebook}:{post:MetaPostMetric;facebook:boolean}){
 const [expanded,setExpanded]=useState(false);
 const caption=post.caption||"";
 return <article className={styles.post}>
  <header className={styles.postHeader}><span className={styles.format}>{label(post.format)}</span><time>{time(post.createdAt)}</time></header>
  <Preview key={post.id+":"+JSON.stringify(post.previewImages)} post={post}/>
  <div className={styles.postBody}>
   {caption?<><p className={styles.caption}>{expanded||caption.length<=280?caption:caption.slice(0,280)+"…"}</p>{caption.length>280&&<button className="ag-secondary" type="button" onClick={()=>setExpanded(v=>!v)}>{expanded?"Show less":"Read full caption"}</button>}</>:<p className={styles.muted}>No caption supplied by Meta.</p>}
   <Stats items={[[facebook?"Reactions":"Likes",post.likes],["Comments",post.comments],["Shares",post.shares],["Views",post.views]]}/>
   <details><summary>Detailed post metrics</summary><Stats items={facebook?[["Unique viewers",post.uniqueViewers]]:[["Reach",post.reach],["Saves",post.saves],["Interactions",post.interactions]]}/><small>Lifetime post insights: {post.insightsStatus.replaceAll("_"," ")}. — means unavailable.</small></details>
   {post.link&&<a className={styles.original} href={post.link} target="_blank" rel="noopener noreferrer">View original {facebook?"Facebook":"Instagram"} post ↗</a>}
  </div>
 </article>;
}
export default function MetaAnalyticsPanel({initialView="overview",accounts,snapshots,checking,busy,limit,setLimit,load,refresh,message}:{initialView?:"overview"|"posts";accounts:Account[];snapshots:Record<string,MetaAnalyticsSnapshot>;checking:string|null;busy:boolean;limit:string;setLimit:(v:string)=>void;load:(id:string)=>Promise<void>;refresh:()=>void;message:string}){
 const [platform,setPlatform]=useState<Account["provider"]>("facebook_pages");
 const [selected,setSelected]=useState<Record<string,string>>({});
 const [sort,setSort]=useState<Sort>("newest");
 const [format,setFormat]=useState("all");
 const activePlatform=accounts.some(a=>a.provider===platform)?platform:accounts[0]?.provider||platform;
 const platformAccounts=accounts.filter(a=>a.provider===activePlatform);
 const account=platformAccounts.find(a=>a.id===selected[activePlatform])||platformAccounts[0];
 const data=account?snapshots[account.id]:undefined;
 const facebook=activePlatform==="facebook_pages";
 const groups=groupPostFormats(data?.recentPosts||[]);
 const formats=groups.map(g=>g.format);
 const weekdays=postActivity(data?.recentPosts||[]);
 const metricLabels:[MetricKey,string][]=[["likes",facebook?"Reactions":"Likes"],["comments","Comments"],["shares","Shares"],["views","Views"],...(facebook?[["uniqueViewers","Unique viewers"] as [MetricKey,string]]:[["reach","Post reach (not deduplicated)"],["saves","Saves"],["interactions","Interactions"]] as [MetricKey,string][])];
 const actualFormat=format==="all"||formats.includes(format)?format:"all";
 const posts=[...(data?.recentPosts||[])].filter(p=>actualFormat==="all"||(p.format||"unknown")===actualFormat).sort((a,b)=>sort==="newest"?(Date.parse(b.createdAt||"")||0)-(Date.parse(a.createdAt||"")||0):(b[sort]??-1)-(a[sort]??-1));
 function selectPlatform(p:Account["provider"]){setPlatform(p);setFormat("all");}
 function selectAccount(id:string){setSelected(old=>({...old,[activePlatform]:id}));setFormat("all");}
 return <section className={"ag-card "+styles.panel} aria-label="Real Meta social analytics">
  <header className={styles.heading}><div><h2>{initialView==="posts"?"Published content":"Social analytics"}</h2><p>Choose a platform, then a page or profile. Each account has its own report.</p></div><button className="ag-secondary" disabled={busy||Boolean(checking)} onClick={refresh}>Refresh accounts</button></header>
  <nav className={styles.platforms} aria-label="Analytics platforms">{([["facebook_pages","Facebook"],["instagram_professional","Instagram"]] as const).map(([p,name])=><button key={p} type="button" className={styles.platform} aria-pressed={activePlatform===p} disabled={!accounts.some(a=>a.provider===p)} onClick={()=>selectPlatform(p)}><strong>{name}</strong><small>{accounts.filter(a=>a.provider===p).length} connected</small></button>)}</nav>
  {!account?<p className="ag-social-empty">Connect a Facebook Page or Instagram professional account in Connections to start.</p>:<>
   <div className={styles.heading}><div><h3>{facebook?"Facebook pages":"Instagram profiles"}</h3><div className={styles.accounts} aria-label="Select analytics account">{platformAccounts.map(a=><button key={a.id} type="button" className={styles.account} aria-pressed={a.id===account.id} onClick={()=>selectAccount(a.id)}>{a.name}{a.expired?" (expired)":""}</button>)}</div></div></div>
   <div className={styles.toolbar}><div><h2>{account.name}</h2><small>{facebook?"Facebook Page":"Instagram professional account"}</small></div><label>Posts to load <select value={limit} onChange={e=>setLimit(e.target.value)}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label><button className="ag-primary" disabled={busy||Boolean(checking)||account.expired} onClick={()=>void load(account.id)}>{checking===account.id?"Loading Meta…":data?"Refresh analytics":"Load real analytics"}</button></div>
   {message&&<p role="status" className="ag-ws-note">{message}</p>}
   {!data?<p className="ag-social-empty">Load real analytics for {account.name}. Other accounts' results will not appear here.</p>:<>
    <p className={styles.muted}>Last checked {time(data.checkedAt)} · {data.recentPosts.length} of up to {data.requestedPosts} posts · Detailed insights on {data.detailCoverage} posts. {data.partial?"Some metrics were unavailable.":""}</p>
    
    {initialView==="overview"?<>
     <Stats items={[[ "Followers",data.followers],["Total media",data.totalPosts],[facebook?"Recent reactions":"Recent likes",data.recentLikes],["Recent comments",data.recentComments],["Recent shares",data.recentShares],["Posts loaded",data.recentPosts.length]]}/>
     <h3>Account performance — 28 days</h3>
     {data.accountInsights?<><p className={styles.muted}>{data.accountInsights.period} · {data.accountInsights.status}. Account-level metrics are distinct from the lifetime post metrics below.</p><div className={styles.stats}>{(facebook?[["page_media_view","Content views"],["page_total_media_view_unique","Unique media viewers"],["page_total_actions","Page action clicks"]]:[["reach","Accounts reached"],["views","Views"],["accounts_engaged","Accounts engaged"],["total_interactions","Interactions"],["profile_views","Profile views"],["profile_links_taps","Profile link taps"]]).map(([key,name])=>{const m=data.accountInsights?.metrics.find(x=>x.name===key);return <div key={key} className={styles.stat}><span>{name}</span><strong>{number(m?.value)}</strong><small>{m?.endAt?"Through "+time(m.endAt):"Not returned by Meta"}</small></div>;})}</div></>:<p className={styles.muted}>Refresh analytics to request account insights.</p>}
     <h3>Metric coverage and averages</h3>
     <div className={styles.stats}>{metricLabels.map(([key,name])=>{const m=metricSummary(data.recentPosts,key);return <div key={key} className={styles.stat}><span>{name} · observed total</span><strong>{number(m.sum)}</strong><small>{m.known}/{m.total} posts reported · avg {m.average===null?"—":m.average.toLocaleString(undefined,{maximumFractionDigits:1})}</small></div>;})}</div>
     <h3>Performance by post type</h3>
     {groups.map(g=><details className={styles.reportGroup} key={g.format} open><summary>{label(g.format)} · {g.posts.length} posts</summary><div className={styles.stats}>{metricLabels.map(([key,name])=>{const m=g.metrics[key];return <div key={key} className={styles.stat}><span>{name}</span><strong>{number(m.sum)}</strong><small>{m.known}/{m.total} reported · avg {m.average===null?"—":m.average.toLocaleString(undefined,{maximumFractionDigits:1})}</small></div>;})}</div></details>)}
     <h3>Publishing activity by weekday</h3><p className={styles.muted}>Based on loaded publication dates in your local timezone. Not a prediction of the best time to post.</p>
     <div className={styles.activity}>{weekdays.map(d=><div key={d.day}><span>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.day]}</span><div className={styles.track}><div style={{width:(100*d.count/Math.max(1,...weekdays.map(x=>x.count)))+"%"}}/></div><strong>{d.count}</strong><small>{d.known?Math.round((d.likes+d.comments)/d.known)+" avg likes/reactions + comments": "No complete engagement data"}</small></div>)}</div>
     <p className={styles.muted}>Figures are scoped to this account. Recent totals cover the loaded posts; lifetime post reach is not account reach. — means unavailable.</p>
     <p className={styles.muted}>Open Published Content to browse the individual posts behind these metrics.</p>
    </>:<>
     <div className={styles.toolbar}><h3>Content library</h3><label>Format <select value={actualFormat} onChange={e=>setFormat(e.target.value)}><option value="all">All formats</option>{formats.map(f=><option key={f} value={f}>{label(f)}</option>)}</select></label><label>Sort by <select value={sort} onChange={e=>setSort(e.target.value as Sort)}><option value="newest">Newest</option><option value="likes">Likes / reactions</option><option value="comments">Comments</option><option value="shares">Shares</option><option value="views">Views</option></select></label></div>
     <p className={styles.muted}>{posts.length} matching posts · images are previews, not live video playback</p>
     {posts.length?groupPostFormats(posts).map(g=><section className={styles.reportGroup} key={g.format}><h3>{label(g.format)} · {g.posts.length}</h3><div className={styles.posts}>{g.posts.map(p=><PostCard key={account.id+":"+p.id} post={p} facebook={facebook}/>)}</div></section>):<p className="ag-social-empty">No matching posts returned.</p>}
    </>}
   </>}
  </>}
 </section>;
}
