"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import "./connections.css";
import {healthLabel,type ConnectionHealthStatus} from "@/lib/reach-connection-health";
import {connectionTrafficLight} from "@/lib/reach-connection-traffic-light";

type Workspace={id:string;name:string;slug:string};
type MetaSetup={provider:"facebook_pages"|"instagram_professional";launchEnabled:boolean;readOnly:true;publishingEnabled:false};
type Provider={id:string;name:string;accounts:string;scopes:string[];mode:"read_only"|"setup_required";launchEnabled:boolean;publishingEnabled:false;connectionStatus:"not_verified"};
type Hub={authenticated:true;environment:string;storageApproved:boolean;workspaces:Workspace[];providers:Provider[];meta:MetaSetup[];publishingEnabled:false;externalMessagingEnabled:false;requiredSetup:string[]};
type MetaCandidate={id:string;name:string;accountType?:string};
type MetaConnection={id:string;provider:string;accountId:string;name:string;connectedAt:string;expiresAt:string|null;lastVerifiedAt:string|null;expired:boolean};
type MetaPending={id:string;provider:string;candidates:MetaCandidate[];expiresAt:string};
type Inventory={connections:MetaConnection[];pending:MetaPending[];readOnly:true;publishingEnabled:false};
type HealthConnection={id:string;provider:string;accountId:string;name:string;connectedAt:string|null;lastVerifiedAt:string|null;expiresAt:string|null;status:ConnectionHealthStatus};
type HealthSnapshot={workspaceId:string;checkedAt:string;liveProviderPing:false;readOnly:true;publishingEnabled:false;connections:HealthConnection[];summary:{total:number;verifiedRecently:number;needsAttention:number}};
const metaId=(id:string)=>id==="facebook"?"facebook_pages":id==="instagram"?"instagram_professional":null;
const trustedMetaAuth=(href:string,provider:string)=>{
 try{
  const u=new URL(href);
  return u.protocol==="https:"&&
   (provider==="facebook"?u.hostname==="www.facebook.com":provider==="instagram"&&(
    u.hostname==="www.instagram.com"||
    (u.hostname==="www.facebook.com"&&u.pathname==="/dialog/oauth"&&/^[0-9]{6,32}$/.test(u.searchParams.get("config_id")||""))))&&
   u.username===""&&u.password===""?u.href:null;
 }catch{return null;}
};
async function call<T>(url:string,init:RequestInit={}):Promise<T>{
 const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...init});
 let value:unknown;try{value=await response.json();}catch{throw Error("Unexpected server response");}
 if(!response.ok){
  const message=value&&typeof value==="object"&&"error" in value&&typeof value.error==="string"?
   value.error:"Request could not be completed";
  throw Error(message);
 }
 return value as T;
}
export default function Connections(){
 const [loggedIn,setLoggedIn]=useState<boolean|null>(null);
 const [hub,setHub]=useState<Hub|null>(null);
 const [workspace,setWorkspace]=useState("");
 const [inventory,setInventory]=useState<Inventory|null>(null);
 const [inventoryError,setInventoryError]=useState("");
 const [health,setHealth]=useState<HealthSnapshot|null>(null);
 const [healthLoading,setHealthLoading]=useState(false);
 const [healthError,setHealthError]=useState("");
 const [attentionOnly,setAttentionOnly]=useState(false);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [info,setInfo]=useState("");
 const [loading,setLoading]=useState(true);
 const [check,setCheck]=useState(0);
 useEffect(()=>{
  const status=new URLSearchParams(window.location.search).get("meta");
  if(status==="select")setInfo("Authorization completed. Choose the exact account below to finish connecting.");
  if(status==="failed")setError("Authorization did not finish. Confirm your provider account has access and try connecting again.");
  if(status==="canceled")setInfo("You canceled authorization. Nothing was connected.");
 },[]);
 useEffect(()=>{
  let active=true;setLoading(true);setError("");
  (async()=>{
   const session=await call<{configured:boolean;authenticated:boolean}>("/api/portal/session");
   if(!active)return;
   setLoggedIn(session.authenticated===true);
   if(!session.authenticated){setHub(null);setWorkspace("");return;}
   const value=await call<Hub>("/api/reach/connection-hub");
   if(!active)return;
   if(value.authenticated!==true||!Array.isArray(value.providers)||!Array.isArray(value.workspaces))throw Error("Invalid connection hub response");
   setHub(value);setWorkspace(old=>value.workspaces.some(w=>w.id===old)?old:value.workspaces[0]?.id||"");
  })().catch(e=>{if(active)setError(e instanceof Error?e.message:"Connection setup unavailable");})
    .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[check]);
 useEffect(()=>{
  let active=true;setInventory(null);setInventoryError("");
  if(!hub?.storageApproved||!workspace)return;
  call<Inventory>("/api/platform/social/meta/connections?workspaceId="+encodeURIComponent(workspace))
   .then(value=>{if(active&&value.readOnly===true&&Array.isArray(value.connections)&&Array.isArray(value.pending))setInventory(value);})
   .catch(e=>{if(active)setInventoryError(e instanceof Error?e.message:"Account inventory unavailable");});
  return()=>{active=false;};
 },[hub,workspace]);
 useEffect(()=>{
  let active=true;setHealth(null);setHealthError("");setHealthLoading(false);
  if(!hub?.storageApproved||!workspace)return;
  setHealthLoading(true);
  call<HealthSnapshot>("/api/reach/connections/health?workspaceId="+encodeURIComponent(workspace))
   .then(value=>{if(active){if(value.workspaceId!==workspace||value.readOnly!==true||value.liveProviderPing!==false||!Array.isArray(value.connections))throw Error("Invalid connection health response");setHealth(value);}})
   .catch(e=>{if(active)setHealthError(e instanceof Error?e.message:"Connection status unavailable");})
   .finally(()=>{if(active)setHealthLoading(false);});
  return()=>{active=false;};
 },[hub,workspace]);
 /** Non-functional Connect buttons should guide the owner into setup, not remain disabled. */
 function guideMetaSetup(provider:"facebook"|"instagram"){
  const service=provider==="facebook"?"Facebook Pages":"Instagram Professional";
  setError(service+" authorization is awaiting REACH platform configuration. Your Meta account has not been modified. No developer app credentials are required from customers.");
 }

 async function start(provider:"facebook"|"instagram"){
  const m=metaId(provider);
  if(!m||!workspace)return;
  setBusy(provider);setError("");setInfo("");
  try{
   const result=await call<{authorizeUrl:string;requestedPermissions:string[];publishingEnabled:false}>("/api/platform/social/meta/start",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId:workspace,provider:m})
   });
   const target=trustedMetaAuth(result.authorizeUrl,provider);
   if(!target||result.publishingEnabled!==false)throw Error("Authorization URL was not approved");
   window.location.assign(target);
  }catch(e){setError(e instanceof Error?e.message:"Unable to start authorization");setBusy("");}
 }
 async function choose(pendingId:string,accountId:string){
  if(!workspace)return;setBusy(pendingId);setError("");
  try{
   await call("/api/platform/social/meta/connections",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({workspaceId:workspace,pendingId,accountId})});
   setInfo("Account selected. Read-only verification is available.");setCheck(n=>n+1);
  }catch(e){setError(e instanceof Error?e.message:"Account selection failed");}
  finally{setBusy("");}
 }
 async function verify(connectionId:string){
  if(!workspace)return;setBusy(connectionId);setError("");
  try{
   await call("/api/platform/social/meta/connections/verify",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({workspaceId:workspace,connectionId})});
   setInfo("Provider confirmed this account's read-only access.");setCheck(n=>n+1);
  }catch(e){setError(e instanceof Error?e.message:"Reverification failed");}
  finally{setBusy("");}
 }
 async function disconnect(connectionId:string){
  if(!workspace||!window.confirm("Disconnect this account from the selected REACH workspace?"))return;
  setBusy(connectionId);setError("");
  try{
   await call("/api/platform/social/meta/connections",{method:"DELETE",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({workspaceId:workspace,connectionId})});
   setInfo("Account disconnected from REACH. Provider authorization may require separate revocation.");setCheck(n=>n+1);
  }catch(e){setError(e instanceof Error?e.message:"Disconnect failed");}
  finally{setBusy("");}
 }

 const availableProviders=hub?.providers.filter(p=>{
  const m=hub.meta.find(x=>x.provider===metaId(p.id));
  return Boolean(m&&(m.launchEnabled||inventory?.connections.some(c=>c.provider===m.provider)||
   inventory?.pending.some(c=>c.provider===m.provider)));
 })||[];
 const cards=availableProviders.map(p=>{
  const meta=hub?.meta.find(m=>m.provider===metaId(p.id));
  const linked=inventory?.connections.filter(c=>c.provider===metaId(p.id))||[];
  const pending=inventory?.pending.filter(c=>c.provider===metaId(p.id))||[];
  const states=linked.map(c=>health?.connections.find(h=>h.id===c.id)?.status||null);
  const status=connectionTrafficLight({
   inventoryReady:inventory!==null,
   linkedCount:linked.length,pendingCount:pending.length,statuses:states,
   explicitExpiredCount:linked.filter(c=>c.expired).length
  });
  return {provider:p,meta,linked,pending,status};
 });
 const visibleCards=attentionOnly?cards.filter(c=>c.status.light!=="green"):cards;
 const counts={
  connected:cards.filter(c=>c.status.light==="green").length,
  attention:cards.filter(c=>c.status.light==="yellow").length,
  disconnected:cards.filter(c=>c.status.light==="red").length
 };
 const statusesKnown=Boolean(inventory&&health&&!healthError&&!inventoryError);
 return <main className="reach-conn">
  <div className="reach-conn-wrap">
   <nav aria-label="Connections navigation"><Link href="/">← Command Center</Link><Link href="/login?next=%2Fconnections">Owner login</Link></nav>
   <header className="reach-simple-header">
    <div className="reach-conn-eyebrow">REACH · CONNECTIONS</div>
    <h1>Your business connections</h1>
    <p>See which business accounts are working and which ones need your attention. Open a connection only when you want to make a change. Posting and messaging stay disabled.</p>
   </header>
   {loading&&<p role="status">Loading your connections…</p>}
   {!loading&&loggedIn===false&&<section className="reach-conn-alert">
    <h2>Sign in to connect accounts</h2><p>Sign in as the REACH owner to see and manage your business connections.</p>
    <Link className="reach-conn-button" href="/login?next=%2Fconnections">Sign in to REACH</Link>
   </section>}
   {error&&<section className="reach-conn-error" role="alert"><strong>Action needed</strong><p>{error}</p><button type="button" onClick={()=>setCheck(v=>v+1)}>Try again</button></section>}
   {info&&<p className="reach-conn-info" role="status">{info}</p>}
   {hub&&<>
    <section className="reach-conn-workspace" aria-label="Choose your business">
     <label htmlFor="reach-workspace">Your business</label>
     <select id="reach-workspace" value={workspace} disabled={!hub.storageApproved||busy!==""} onChange={e=>setWorkspace(e.target.value)}>
      <option value="">{hub.storageApproved?"Choose a business":"Business list unavailable"}</option>
      {hub.workspaces.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}
     </select>
     <button type="button" onClick={()=>setCheck(v=>v+1)} disabled={busy!==""}>Refresh status</button>
    </section>
    <div className="reach-light-legend" aria-label="Connection light meanings">
     <span><i className="reach-light-dot green" aria-hidden="true"/>Green: connected</span>
     <span><i className="reach-light-dot yellow" aria-hidden="true"/>Yellow: needs attention</span>
     <span><i className="reach-light-dot red" aria-hidden="true"/>Red: disconnected</span>
    </div>
    <section className="reach-conn-overview" aria-label="Connection summary">
     <div><strong>Connected</strong><span>{statusesKnown?counts.connected:"—"}</span></div>
     <div><strong>Needs attention</strong><span>{inventory?counts.attention:"—"}</span></div>
     <div><strong>Disconnected</strong><span>{inventory?counts.disconnected:"—"}</span></div>
    </section>
    {!hub.storageApproved&&<section className="reach-conn-alert"><h2>Connections are unavailable</h2>
     <p>Your accounts have not been changed. REACH is finishing the secure connection setup.</p>
    </section>}
    <section className="reach-health-toolbar" aria-label="Connection status tools">
     <div><strong>Account status</strong><p>{health?"Last saved check: "+new Date(health.checkedAt).toLocaleString()+". Provider was not contacted.":healthLoading?"Checking saved connection records…":"No recent connection status available."}</p></div>
     <button type="button" aria-pressed={attentionOnly} onClick={()=>setAttentionOnly(v=>!v)} disabled={!inventory}>
      {attentionOnly?"Show all connections":"Show only connections needing attention"}
     </button>
    </section>
    {(healthError||inventoryError)&&<p className="reach-health-warning" role="status">We couldn't confirm all connection details. Your accounts are unchanged. {healthError||inventoryError}</p>}
    <div className="reach-conn-grid" aria-label="Available business integrations">
    {visibleCards.map(({provider:p,meta,linked,pending,status})=>{
     const canConnect=Boolean(meta?.launchEnabled&&hub.storageApproved&&workspace&&!busy);
     const action=()=>canConnect?void start(p.id as "facebook"|"instagram"):guideMetaSetup(p.id as "facebook"|"instagram");
     return <article key={p.id} id={"reach-provider-"+p.id} className={"reach-conn-card reach-conn-card-"+status.light}>
      <div className="reach-conn-card-head">
       <h2>{p.name}</h2>
       <span className={"reach-light reach-light-"+status.light} role="status" aria-label={p.name+": "+status.label}>
        <i className={"reach-light-dot "+status.light} aria-hidden="true"/>
        <span>{status.label}</span>
       </span>
      </div>
      {linked.length>0&&<p className="reach-conn-account-name">{linked.length===1?linked[0].name:linked.length+" business accounts linked"}</p>}
      <p className="reach-conn-status-help">{status.help}</p>
      {pending.map(f=><div className="reach-conn-pending" key={f.id}>
       <strong>Finish connecting</strong><p>Choose the business account you want to use:</p>
       {f.candidates.map(c=><button key={c.id} type="button" disabled={busy!==""} onClick={()=>void choose(f.id,c.id)}>{c.name}</button>)}
      </div>)}
      {linked.length===0&&pending.length===0&&<button className="reach-conn-primary" type="button" disabled={busy!==""} onClick={action}>
       {busy===p.id?"Opening secure sign-in…":"Connect "+p.name}
      </button>}
      <details className="reach-conn-details" key={workspace+":"+p.id+":"+(linked.length?"linked":"new")+":"+check}>
       <summary>{linked.length?"Manage connection":"More information"}</summary>
       <div className="reach-conn-detail-body">
        <p>{p.accounts}</p>
        {linked.map(c=>{
         const h=health?.connections.find(x=>x.id===c.id);
         const one=connectionTrafficLight({inventoryReady:true,linkedCount:1,pendingCount:0,statuses:[h?.status||null],explicitExpiredCount:c.expired?1:0});
         return <div className="reach-conn-linked" key={c.id}>
          <div className="reach-linked-head"><strong>{c.name}</strong>
           <span className={"reach-light reach-light-"+one.light}><i className={"reach-light-dot "+one.light} aria-hidden="true"/>{one.label}</span>
          </div>
          <p className="reach-conn-small">{h?healthLabel(h.status):"Status unavailable"}</p>
          <p className="reach-conn-small">Last checked: {c.lastVerifiedAt?new Date(c.lastVerifiedAt).toLocaleString():"Not yet verified"}</p>
          <p className="reach-conn-small">Access expires: {c.expiresAt?new Date(c.expiresAt).toLocaleString():"Not reported"}</p>
          <div className="reach-linked-actions">
           <button type="button" disabled={busy!==""||c.expired} onClick={()=>void verify(c.id)}>{busy===c.id?"Checking…":"Check connection"}</button>
           <button className="reach-conn-disconnect" type="button" disabled={busy!==""} onClick={()=>void disconnect(c.id)}>Disconnect</button>
          </div>
         </div>;
        })}
        {linked.length>0&&<button type="button" disabled={busy!==""} onClick={action}>
         {busy===p.id?"Opening secure sign-in…":"Reconnect or add account"}
        </button>}
        {!meta?.launchEnabled&&<p className="reach-conn-small">This connection is currently unavailable for new sign-ins. Existing accounts have not been changed.</p>}
        {!workspace&&<p className="reach-conn-small">Choose a business before connecting.</p>}
        <details className="reach-technical-details">
         <summary>Technical information</summary>
         <p>Read-only permissions: {p.scopes.length?p.scopes.join(", "):"Not configured"}</p>
         <p>Only a successfully completed provider OAuth and verified stored account record can establish a connection.</p>
        </details>
       </div>
      </details>
     </article>;
    })}
    </div>
    {attentionOnly&&visibleCards.length===0&&cards.length>0&&<p className="reach-conn-info" role="status">No connections need attention based on the last saved check.</p>}
    {cards.length===0&&inventory&&<section className="reach-conn-alert"><h2>No available integrations yet</h2><p>Only available connections or accounts already linked to this business appear here. REACH will add new services as they become ready.</p></section>}
    <p className="reach-conn-disclaimer">Status lights reflect saved connection and verification records, not continuous live monitoring. A green light means access was verified recently, not that a provider was contacted right now. Read-only access remains in place; publishing and messaging stay disabled.</p>
   </>}
  </div>
 </main>;
}
