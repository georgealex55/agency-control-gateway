"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import "./connections.css";
import {healthLabel,type ConnectionHealthStatus} from "@/lib/reach-connection-health";

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
 const [health,setHealth]=useState<HealthSnapshot|null>(null);
 const [healthLoading,setHealthLoading]=useState(false);
 const [healthError,setHealthError]=useState("");
 const [attentionOnly,setAttentionOnly]=useState(false);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [info,setInfo]=useState("");
 const [loading,setLoading]=useState(true);
 const [check,setCheck]=useState(0);
 const [expandedProvider,setExpandedProvider]=useState<string|null>(null);
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
  let active=true;setInventory(null);
  if(!hub?.storageApproved||!workspace)return;
  call<Inventory>("/api/platform/social/meta/connections?workspaceId="+encodeURIComponent(workspace))
   .then(value=>{if(active&&value.readOnly===true&&Array.isArray(value.connections)&&Array.isArray(value.pending))setInventory(value);})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:"Account inventory unavailable");});
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
 return <main className="reach-conn">
  <div className="reach-conn-wrap">
   <nav aria-label="Connections navigation"><Link href="/">← Command Center</Link><Link href="/login?next=%2Fconnections">Owner login</Link></nav>
   <header><div className="reach-conn-eyebrow">REACH 3.0 · CONNECTION HEALTH</div><h1>Your connected accounts.</h1>
    <p>Review authorized accounts, recent verification and expiration warnings in one place. Only available integrations are shown. Connect and verify directly through the provider; publishing and messaging stay disabled. No developer app credentials are required from customers.</p>
   </header>
   {loading&&<p role="status">Checking owner session and provider configuration…</p>}
   {!loading&&loggedIn===false&&<section className="reach-conn-alert">
    <h2>Sign in to connect accounts</h2><p>Only an authenticated REACH owner can start authorization or view linked workspace accounts.</p>
    <Link className="reach-conn-button" href="/login?next=%2Fconnections">Sign in to REACH</Link>
   </section>}
   {error&&<section className="reach-conn-error" role="alert"><strong>Action needed</strong><p>{error}</p><button onClick={()=>setCheck(v=>v+1)}>Retry status</button></section>}
   {info&&<p className="reach-conn-info" role="status">{info}</p>}
   {hub&&<>
    <section className="reach-conn-overview">
     <div><strong>Linked accounts</strong><span>{health?health.summary.total:healthLoading?"Loading…":"Not verified"}</span></div>
     <div><strong>Verified recently</strong><span>{health?health.summary.verifiedRecently:"—"}</span></div>
     <div><strong>Needs attention</strong><span>{health?health.summary.needsAttention:"—"}</span></div>
    </section>
    {!hub.storageApproved&&<section className="reach-conn-alert"><h2>Finish secure provider setup</h2>
     <p>Social connections are temporarily unavailable while REACH finishes provider setup. Your accounts are unchanged; try again later.</p>
    </section>}
    <section className="reach-conn-workspace">
     <label htmlFor="reach-workspace">Business workspace</label>
     <select id="reach-workspace" value={workspace} disabled={!hub.storageApproved||busy!==""} onChange={e=>setWorkspace(e.target.value)}>
      <option value="">{hub.storageApproved?"Choose a workspace":"Workspace storage not yet approved"}</option>
      {hub.workspaces.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}
     </select>
     <button onClick={()=>setCheck(v=>v+1)} disabled={busy!==""}>Refresh connections</button>
    </section>
    <section className="reach-health-toolbar" aria-label="Connection health tools">
     <div><strong>Connection status</strong><p>{health?"Last database snapshot: "+new Date(health.checkedAt).toLocaleString()+". Provider was not contacted.":healthLoading?"Loading connection snapshot…":"Status has not been verified."}</p></div>
     <div><button type="button" aria-pressed={attentionOnly} onClick={()=>setAttentionOnly(v=>!v)} disabled={!health}>{attentionOnly?"Show all accounts":"Show accounts needing attention"}</button></div>
    </section>
    {healthError&&<p className="reach-health-warning" role="status">Health check unavailable: {healthError}. Existing connections have not been changed.</p>}
    <div className="reach-conn-grid">
    {hub.providers.filter(p=>{const m=hub.meta.find(x=>x.provider===metaId(p.id));return Boolean(m&&(m.launchEnabled||inventory?.connections.some(c=>c.provider===m.provider)||inventory?.pending.some(c=>c.provider===m.provider)));}).map(p=>{
      const meta=hub.meta.find(m=>m.provider===metaId(p.id));
      const linked=inventory?.connections.filter(c=>c.provider===metaId(p.id))||[];
      const pending=inventory?.pending.filter(c=>c.provider===metaId(p.id))||[];
      const visibleLinked=attentionOnly&&health?linked.filter(c=>health.connections.find(h=>h.id===c.id)?.status!=="verified_recently"):linked;
      const stats=linked.map(c=>health?.connections.find(h=>h.id===c.id)).filter((h):h is HealthConnection=>Boolean(h));
      const canConnect=Boolean(meta?.launchEnabled&&hub.storageApproved&&workspace&&!busy);
      const requiresSetup=Boolean(meta&&!meta.launchEnabled);
      return <article key={p.id} id={"reach-provider-"+p.id} className="reach-conn-card">
       <div className="reach-conn-card-head"><h2>{p.name}</h2><span>{health&&stats.length?stats.every(h=>h.status==="verified_recently")?"Recently verified":stats.some(h=>h.status==="expired")?"Reconnect required":"Attention required":linked.length?"Status unknown":"Not connected"}</span></div>
       <p>{p.accounts}</p>
       <p className="reach-conn-small">Access scope: {p.scopes.length?p.scopes.join(", "):"Requires approved developer access"}</p>
       {meta?<><button type="button" disabled={busy!==""}
        onClick={()=>canConnect?void start(p.id as "facebook"|"instagram"):guideMetaSetup(p.id as "facebook"|"instagram")}>
        {busy===p.id?"Opening Meta…":linked.length?"Reconnect "+p.name:"Connect "+p.name}
       </button>
        {requiresSetup&&<p className="reach-conn-small">This connection is not available yet. REACH support is completing the Meta integration; no developer configuration is needed from you.</p>}
        {!requiresSetup&&!workspace&&<p className="reach-conn-small">Choose your business workspace before connecting.</p>}
        {pending.map(f=><div className="reach-conn-pending" key={f.id}><strong>Select an authorized account</strong>
         {f.candidates.map(c=><button key={c.id} disabled={busy!==""} onClick={()=>void choose(f.id,c.id)}>{c.name} · {c.id}</button>)}
        </div>)}
        {visibleLinked.map(c=>{const h=health?.connections.find(x=>x.id===c.id);return <div className="reach-conn-linked" key={c.id}><strong>{c.name}</strong>
         <small className={"reach-health-status "+(h?.status==="verified_recently"?"ok":"attention")}>{h?healthLabel(h.status):"Status unavailable"}</small>
         <small>Last verified: {c.lastVerifiedAt?new Date(c.lastVerifiedAt).toLocaleString():"Not yet verified"}</small>
         <small>Token expiry: {c.expiresAt?new Date(c.expiresAt).toLocaleString():"Not reported"}</small>
         <div><button disabled={busy!==""||c.expired} onClick={()=>void verify(c.id)}>Verify</button>
         <button className="reach-conn-disconnect" disabled={busy!==""} onClick={()=>void disconnect(c.id)}>Disconnect</button></div>
        </div>})}
        {attentionOnly&&linked.length>0&&visibleLinked.length===0&&<p className="reach-conn-small">No linked accounts need attention based on the latest snapshot.</p>}
       </>:<><button type="button" onClick={()=>setExpandedProvider(value=>value===p.id?null:p.id)}>
         {expandedProvider===p.id?"Hide availability details":"About this connection"}
        </button>
        {expandedProvider===p.id&&<div className="reach-conn-setup-info">
         <strong>Integration not yet available</strong>
         <p>Connecting {p.name} is not available yet. REACH will provide direct account authorization when this integration is ready. No developer configuration is required from you.</p>
        </div>}</>}
      </article>;
    })}
    </div>
    {inventory&&!hub.providers.some(p=>{const m=hub.meta.find(x=>x.provider===metaId(p.id));return Boolean(m&&(m.launchEnabled||inventory.connections.some(c=>c.provider===m.provider)||inventory.pending.some(c=>c.provider===m.provider)));})&&<section className="reach-conn-alert"><h2>No available integrations yet</h2><p>Only operational connections and existing linked accounts appear here. New integrations are added after authorization and security testing—not displayed as nonfunctional buttons.</p></section>}
    <p className="reach-conn-disclaimer">Health is based on stored provider verification and expiry timestamps, not continuous connectivity. Only a successfully completed provider OAuth and verified stored account record can establish a connection. No account is presumed connected from this setup directory alone.</p>
   </>}
  </div>
 </main>;
}
