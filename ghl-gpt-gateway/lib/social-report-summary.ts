import type {MetaPostMetric} from "./social-meta-analytics";
export const formatOrder=["PHOTO","REEL","VIDEO","CAROUSEL","TEXT","LINK","STORY","unknown"] as const;
export const metricKeys=["likes","comments","shares","views","reach","saves","interactions","uniqueViewers"] as const;
export type MetricKey=typeof metricKeys[number];
export function metricSummary(posts:readonly MetaPostMetric[],key:MetricKey){
 const values=posts.map(p=>p[key]).filter((v):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=0);
 const sum=values.length?values.reduce((a,v)=>a+v,0):null;
 return {sum,known:values.length,total:posts.length,average:sum===null?null:sum/values.length};
}
export function groupPostFormats(posts:readonly MetaPostMetric[]){
 const keys=[...new Set(posts.map(p=>p.format||"unknown"))];
 return keys.sort((a,b)=>{const rank=(x:string)=>{const i=formatOrder.indexOf(x as typeof formatOrder[number]);return i<0?99:i;};return rank(a)-rank(b)||a.localeCompare(b);}).map(format=>{
  const records=posts.filter(p=>(p.format||"unknown")===format);
  return {format,posts:records,metrics:Object.fromEntries(metricKeys.map(key=>[key,metricSummary(records,key)])) as Record<MetricKey,ReturnType<typeof metricSummary>>};
 });
}
export function postActivity(posts:readonly MetaPostMetric[]){
 const days=Array.from({length:7},(_,day)=>({day,count:0,likes:0,comments:0,known:0}));
 for(const p of posts){
  if(!p.createdAt||!Number.isFinite(Date.parse(p.createdAt)))continue;
  const day=days[new Date(p.createdAt).getDay()];day.count++;
  if(p.likes!==null&&p.comments!==null){day.likes+=p.likes;day.comments+=p.comments;day.known++;}
 }
 return days;
}
