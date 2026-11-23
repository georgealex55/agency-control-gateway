"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import "./connections.css";
import NeonCustomerCard from "./neon-customer-card";

type Workspace={id:string;name:string;slug:string};
type MetaSetup={provider:"facebook_pages"|"instagram_professional";launchEnabled:boolean;readOnly:true;publishingEnabled:false};
type Provider={id:string;name:string;accounts:string;scopes:string[];mode:"read_only"|"setup_required";launchEnabled:boolean;publishingEnabled:false;connectionStatus:"not_verified"};
type Hub={authenticated:true;environment:string;storageApproved:boolean;workspaces:Workspace[];providers:Provider[];meta:MetaSetup[];publishingEnabled:false;externalMessagingEnabled:false;requiredSetup:string[]};
type MetaCandidate={id:string;name:string;accountType?:string};
type MetaConnection={id:string;provider:string;accountId:string;name:string;connectedAt:string;expiresAt:string|null;lastVerifiedAt:string|null;expired:boolean};
type MetaPending={id:string;provider:string;candidates:MetaCandidate[];expiresAt:string};
type Inventory={connections:MetaConnection[];pending:MetaPending[];readOnly:true;publishingEnabled:false};
const metaId=(id:string)=>id==="facebook"?"facebook_pages":id==="instagram"?"instagram_professional":null;
const trustedMetaAuth=(href:string,provider:string)=>{
 try{
  const u=new URL(href);
  return u.protocol==="https:"&&
   (provider==="facebook"?u.hostname==="www.facebook.com":provider==="instagram"&&u.hostname==="www.instagram.com")&&
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
 /** Non-functional Connect buttons should guide the owner into setup, not remain disabled. */
 function guideMetaSetup(provider:"facebook"|"instagram"){
  const service=provider==="facebook"?"Facebook Pages":"Instagram Professional";
  setError(service+" authorization is not available on this REACH environment. Try again after the platform enables this connection. No developer app credentials are required.");
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
   <header><div className="reach-conn-eyebrow">REACH 2.3 · OWNER CONNECTIONS</div><h1>Connect your accounts.</h1>
    <p>Connect Facebook and Instagram with a secure Meta sign-in. Approve access, choose your business account, and REACH handles the connection. No developer account or API keys required.</p>
   </header>
   {loading&&<p role="status">Checking owner session and provider configuration…</p>}
   {!loading&&loggedIn===false&&<section className="reach-conn-alert">
    <h2>Sign in to connect accounts</h2><p>Only an authenticated REACH owner can start authorization or view linked workspace accounts.</p>
    <Link className="reach-conn-button" href="/login?next=%2Fconnections">Sign in to REACH</Link>
   </section>}
   {error&&<section className="reach-conn-error" role="alert"><strong>Action needed</strong><p>{error}</p><button onClick={()=>setCheck(v=>v+1)}>Retry status</button></section>}
   {info&&<p className="reach-conn-info" role="status">{info}</p>}
   {hub&&<>
    <NeonCustomerCard/>
    <section className="reach-conn-overview">
     <div><strong>Owner session</strong><span>Authenticated</span></div>
     <div><strong>Connection storage</strong><span>{hub.storageApproved?"Approved workspace data":"Setup required"}</span></div>
     <div><strong>External posting</strong><span>Disabled</span></div>
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
    <div className="reach-conn-grid">
    {hub.providers.map(p=>{
      const meta=hub.meta.find(m=>m.provider===metaId(p.id));
      const linked=inventory?.connections.filter(c=>c.provider===metaId(p.id))||[];
      const pending=inventory?.pending.filter(c=>c.provider===metaId(p.id))||[];
      const canConnect=Boolean(meta?.launchEnabled&&hub.storageApproved&&workspace&&!busy);
      const requiresSetup=Boolean(meta&&!meta.launchEnabled);
      return <article key={p.id} id={"reach-provider-"+p.id} className="reach-conn-card">
       <div className="reach-conn-card-head"><h2>{p.name}</h2><span>{linked.some(c=>!c.expired&&c.lastVerifiedAt)?"Connected":linked.length?"Reconnect required":"Not connected"}</span></div>
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
        {linked.map(c=><div className="reach-conn-linked" key={c.id}><strong>{c.name}</strong><small>{c.expired?"Expired token — reconnect":"Read-only access on file"}</small>
         <small>Last verified: {c.lastVerifiedAt?new Date(c.lastVerifiedAt).toLocaleString():"Not yet verified"}</small>
         <div><button disabled={busy!==""||c.expired} onClick={()=>void verify(c.id)}>Verify</button>
         <button className="reach-conn-disconnect" disabled={busy!==""} onClick={()=>void disconnect(c.id)}>Disconnect</button></div>
        </div>)}
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
    <p className="reach-conn-disclaimer">Only a successfully completed provider OAuth and verified stored account record can establish a connection. No account is presumed connected from this setup directory alone.</p>
   </>}
  </div>
 </main>;
}
