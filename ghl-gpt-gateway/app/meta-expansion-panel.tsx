"use client";
import {useEffect,useRef,useState} from "react";
type Feature="ads"|"businesses"|"leads"|"instagram_comments";
type Account={id:string;name:string;provider:"facebook_pages"|"instagram_professional";expired:boolean};
type Row=Record<string,unknown>;
const names:Record<Feature,string>={ads:"Advertising analytics",businesses:"Business discovery",leads:"Lead forms & submissions",instagram_comments:"Instagram comment activity"};
const labels:Record<string,string>={id:"ID",name:"Name",currency:"Currency",status:"Status",spend:"Spend",impressions:"Impressions",clicks:"Clicks",reach:"Reach",start:"Start",end:"End",createdAt:"Created",format:"Format",comments:"Comments",contacts:"Contact fields"};
function show(value:unknown){if(value===null||value===undefined)return "Unavailable";if(typeof value==="string"||typeof value==="number")return String(value);return "Unavailable";}
export default function MetaExpansionPanel({workspaceId,accounts}:{workspaceId:string;accounts:Account[]}){
 const [connectionId,setConnectionId]=useState(accounts[0]?.id||"");
 const [feature,setFeature]=useState<Feature>("ads"),[assetId,setAssetId]=useState("");
 const [inventory,setInventory]=useState<Row[]|null>(null),[report,setReport]=useState<Row[]|null>(null);
 const [more,setMore]=useState(false),[checked,setChecked]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const request=useRef(0);
 const account=accounts.find(a=>a.id===connectionId);
 const choices:Feature[]=account?.provider==="instagram_professional"?["instagram_comments"]:["ads","businesses","leads"];
 function clear(){request.current++;setBusy(false);setInventory(null);setReport(null);setAssetId("");setMore(false);setChecked("");setError("");}
 useEffect(()=>{if(!accounts.some(a=>a.id===connectionId))setConnectionId(accounts[0]?.id||"");},[accounts,connectionId]);
 useEffect(()=>{clear();setFeature(account?.provider==="instagram_professional"?"instagram_comments":"ads");},[workspaceId,connectionId,account?.provider]);
 async function load(selected?:string,contacts=false){
  if(!workspaceId||!connectionId||account?.expired||busy||!choices.includes(feature))return;
  const id=++request.current;setBusy(true);setError("");setMore(false);setChecked("");
  if(selected)setReport(null);else{setInventory(null);setReport(null);setAssetId("");}
  try{
   const q=new URLSearchParams({workspaceId,connectionId,feature});if(selected)q.set("assetId",selected);if(contacts)q.set("contacts","1");
   const r=await fetch("/api/platform/social/meta/expansion?"+q.toString(),{cache:"no-store",credentials:"same-origin"});
   const v=await r.json();if(id!==request.current)return;
   if(!r.ok||v.workspaceId!==workspaceId||v.connectionId!==connectionId||v.readOnly!==true||v.snapshot?.source!=="meta_graph_api"||!Array.isArray(v.snapshot.rows))throw Error(v.error||"Meta report unavailable");
   if(selected)setReport(v.snapshot.rows);else setInventory(v.snapshot.rows);
   setMore(v.snapshot.moreAvailable===true);setChecked(v.snapshot.checkedAt);
  }catch(e){if(id===request.current)setError(e instanceof Error?e.message:"Report unavailable");}finally{if(id===request.current)setBusy(false);}
 }
 const rows=report??inventory;
 const columns=rows?.length?Object.keys(rows[0]).filter(k=>k!=="contacts"):[];
 return <section className="ag-card" aria-label="Meta business tools">
  <h2>Meta business tools</h2><p>Discover accessible assets and view real provider reports. Nothing is posted, imported into CRM or changed in Meta.</p>
  <label>Connection <select value={connectionId} disabled={busy} onChange={e=>setConnectionId(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.expired?" (expired)":""}</option>)}</select></label>
  <label>Report <select value={feature} disabled={busy} onChange={e=>{clear();setFeature(e.target.value as Feature);}}>{choices.map(f=><option key={f} value={f}>{names[f]}</option>)}</select></label>
  <p>{feature==="ads"?"Discover ad accounts accessible to this Facebook authorization, then select one for a 30-day account report. Results are not attributed to the selected Page.":feature==="businesses"?"List businesses accessible to the authorization, not necessarily owned by the selected Page.":feature==="leads"?"Discover forms on this Page and preview up to 25 recent submissions. Contact fields require a separate explicit action; no lead records are persisted.":"Select recent media to check comment activity. No comment text, usernames or replies are stored or sent."}</p>
  <button type="button" className="ag-primary" disabled={busy||!account||account.expired} onClick={()=>void load()}>{busy?"Checking Meta…":"Load live report"}</button>
  {inventory&&feature!=="businesses"&&inventory.length>0&&<div className="ag-ws-note"><label>{feature==="ads"?"Ad account":feature==="leads"?"Lead form":"Instagram media"} <select value={assetId} disabled={busy} onChange={e=>{setReport(null);setAssetId(e.target.value);setError("");}}><option value="">Select an asset</option>{inventory.filter(o=>typeof o.id==="string").map(o=><option key={String(o.id)} value={String(o.id)}>{show(o.name??o.format??o.id)} · {show(o.id)}</option>)}</select></label><button type="button" className="ag-secondary" disabled={busy||!assetId} onClick={()=>void load(assetId)}>View details</button>{feature==="leads"&&<button type="button" className="ag-secondary" disabled={busy||!assetId} onClick={()=>{if(window.confirm("View submitted contact fields for this form? Use only for the purpose the person consented to. No CRM import or storage."))void load(assetId,true);}}>View contact fields</button>}</div>}
  {error&&<p role="alert">{error}</p>}
  {checked&&<p>Checked {new Date(checked).toLocaleString()}{more?" · More results exist; this is a bounded sample.":""}</p>}
  {rows&&rows.length===0&&<p>No records returned by Meta.</p>}
  {rows&&rows.length>0&&<div style={{overflowX:"auto"}}><table><thead><tr>{columns.map(k=><th key={k}>{labels[k]||k}</th>)}{rows.some(o=>Array.isArray(o.contacts))&&<th>Contact fields</th>}</tr></thead><tbody>{rows.map((o,i)=><tr key={i}>{columns.map(k=><td key={k}>{show(o[k])}</td>)}{rows.some(x=>Array.isArray(x.contacts))&&<td>{Array.isArray(o.contacts)?o.contacts.map((c,j)=><div key={j}>{show(c?.name)}: {show(c?.value)}</div>):"Unavailable"}</td>}</tr>)}</tbody></table></div>}
 </section>;
}
