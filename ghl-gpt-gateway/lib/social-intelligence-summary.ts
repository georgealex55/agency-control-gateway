import type {MetaAnalyticsSnapshot} from "@/lib/social-meta-analytics";
export type ProfileScan={id:string;name:string;provider:string;snapshot:MetaAnalyticsSnapshot|null};
export function observed(values:(number|null|undefined)[]){
 const valid=values.filter((n):n is number=>typeof n==="number"&&Number.isFinite(n)&&n>=0);
 return {value:valid.length?valid.reduce((a,b)=>a+b,0):null,known:valid.length,total:values.length};
}
export function profilePerformance<T extends ProfileScan>(p:T){
 const data=p.snapshot,posts=data?.recentPosts||[];
 const complete=posts.filter(x=>x.likes!==null&&x.comments!==null);
 const reactions=observed(posts.map(x=>x.likes)),comments=observed(posts.map(x=>x.comments)),shares=observed(posts.map(x=>x.shares));
 const interactions=observed(complete.map(x=>x.likes!+x.comments!));
 const avg=complete.length&&interactions.value!==null?interactions.value/complete.length:null;
 const rate=avg!==null&&data?.followers&&data.followers>0?100*avg/data.followers:null;
 const dated=posts.map(x=>Date.parse(x.createdAt||"")).filter(Number.isFinite);
 const last=dated.length?Math.max(...dated):null;
 const insights=Object.fromEntries((data?.accountInsights?.metrics||[]).map(m=>[m.name,m.value]));
 return {...p,followers:data?.followers??null,posts:posts.length,completePosts:complete.length,reactions,comments,shares,interactions,avg,rate,last,
  views:insights[p.provider==="facebook_pages"?"page_media_view":"views"]??null,
  reach:insights[p.provider==="facebook_pages"?"page_total_media_view_unique":"reach"]??null};
}
export function ranked<T>(rows:T[],metric:(r:T)=>number|null){
 return rows.filter(r=>metric(r)!==null).sort((a,b)=>metric(b)!-metric(a)!);
}
export function dedupeAssets<T extends {assetId:string}>(rows:T[]){
 const seen=new Set<string>();return rows.filter(r=>{if(seen.has(r.assetId))return false;seen.add(r.assetId);return true;});
}
export function publishingActivity(profiles:ProfileScan[],now=Date.now()){
 const day=86400000,end=Math.floor(now/day)*day,start=end-28*day;
 const dates=Array.from({length:28},(_,i)=>({date:new Date(start+i*day).toISOString().slice(0,10),count:0}));
 for(const p of profiles)for(const post of p.snapshot?.recentPosts||[]){
  const t=Date.parse(post.createdAt||"");if(t>=start&&t<end)dates[Math.floor((t-start)/day)].count++;
 }
 return dates;
}
export function contentGroups(profiles:ProfileScan[]){
 const groups=new Map<string,{format:string;posts:number;complete:number;interactions:number}>();
 for(const p of profiles)for(const post of p.snapshot?.recentPosts||[]){
  const format=post.format||"Unclassified",g=groups.get(format)||{format,posts:0,complete:0,interactions:0};g.posts++;
  if(post.likes!==null&&post.comments!==null){g.complete++;g.interactions+=post.likes+post.comments;}
  groups.set(format,g);
 }
 return [...groups.values()].map(g=>({...g,avg:g.complete?g.interactions/g.complete:null})).sort((a,b)=>b.posts-a.posts);
}
export function priorityNotes(profiles:ProfileScan[],now=Date.now()){
 return profiles.flatMap(p=>{
  const m=profilePerformance(p),notes:{name:string;priority:string;text:string}[]=[];
  const add=(priority:string,text:string)=>notes.push({name:p.name,priority,text});
  if(!p.snapshot){add("Check","No profile report returned. Check connection and permissions.");return notes;}
  if(m.reach===null||m.views===null)add("Check","Exposure metrics unavailable; check insights permissions before judging reach.");
  if(m.last!==null&&now-m.last>14*86400000)add("Action","No loaded publication in the last 14 days. Review publishing cadence.");
  if(m.posts===0)add("Check","No recent posts returned; verify content access before assessing inactivity.");
  if(m.posts>0&&m.completePosts<m.posts)add("Check","Engagement coverage is incomplete. Avoid ranking on missing observations.");
  if(m.completePosts>=3&&m.avg===0)add("Action","Loaded posts with complete counts have zero observed likes/reactions and comments. Test a new content format or call to action.");
  const formats=ranked(contentGroups([p]).filter(g=>g.complete>=3),g=>g.avg);
  if(formats.length>=2&&formats[0].avg!>formats[formats.length-1].avg!)add("Opportunity","Test more "+formats[0].format.toLowerCase()+" content: highest observed average likes/reactions + comments among formats with at least 3 complete posts. Not a causal prediction.");
  return notes;
 });
}

export type HealthDimension={name:string;status:"observed"|"attention"|"unknown";detail:string};
export function profileHealth(p:ProfileScan,unread:number|null,now=Date.now()):HealthDimension[]{
 const m=profilePerformance(p),d=p.snapshot;
 const dim=(name:string,status:HealthDimension["status"],detail:string):HealthDimension=>({name,status,detail});
 return [
  dim("Exposure",m.views===null||m.reach===null?"unknown":"observed",m.views===null||m.reach===null?"Reach or views not returned.":"Reach and views reported; no benchmark applied."),
  dim("Engagement",m.completePosts<3?"unknown":m.avg===0?"attention":"observed",m.completePosts<3?"Need at least 3 complete posts.":m.avg===0?"No observed likes/reactions or comments.":"Positive observed engagement; not a quality grade."),
  dim("Publishing",m.last===null?"unknown":now-m.last>14*86400000?"attention":"observed",m.last===null?"No dated post returned.":now-m.last>14*86400000?"Latest loaded post is over 14 days old.":"A loaded post is dated within 14 days."),
  dim("Customer activity",unread===null?"unknown":unread>0?"attention":"observed",unread===null?"Unread count not available.":unread>0?"Unread messages need review.":"Provider reports zero unread messages."),
  dim("Data coverage",!d?"unknown":d.partial||m.completePosts<m.posts||!m.posts?"attention":"observed",!d?"Profile report unavailable.":d.partial||m.completePosts<m.posts||!m.posts?"Some observations are missing or no posts returned.":"Loaded report has no flagged partial data.")
 ];
}
