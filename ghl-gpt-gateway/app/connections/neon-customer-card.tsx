"use client";
import {useEffect,useState,type FormEvent} from "react";
import "./neon-customer-card.css";

type Mode="url"|"fields";
type Verification={verified:true;connectionSaved:false;storageActivated:false;database:string;role:string;check:"read_only_select";note:string};
type LiveNeon={connected:true;scope:"owner_session";persisted:false;storageActivated:false;readOnly:true;database:string;role:string;hostname:string;expiresAt:string;verifiedAt:string};
type SavedNeon={configured:true;saved:true;persisted:true;storageActivated:false;readOnly:true;scope:"single_owner";database:string;role:string;hostname:string;verifiedAt:string;updatedAt:string};

/** Owner-only Neon connection verification and encrypted temporary session. No durable credential vault. */
export default function NeonCustomerCard(){
 const [mode,setMode]=useState<Mode>("url");
 const [dsn,setDsn]=useState("");
 const [host,setHost]=useState("");
 const [database,setDatabase]=useState("");
 const [role,setRole]=useState("");
 const [password,setPassword]=useState("");
 const [project,setProject]=useState("");
 const [branch,setBranch]=useState("");
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<Verification|null>(null);
 const [live,setLive]=useState<LiveNeon|null>(null);
 const [saved,setSaved]=useState<SavedNeon|null>(null);
 const [vaultConfigured,setVaultConfigured]=useState(false);
 const [error,setError]=useState("");
 const clearSecret=()=>{setDsn("");setPassword("");};
 useEffect(()=>{
  let active=true;
  fetch("/api/reach/connections/neon/live",{credentials:"same-origin",cache:"no-store"})
   .then(async response=>{if(!response.ok)throw Error("Live Neon status unavailable");return response.json() as Promise<LiveNeon|{connected:false}>;})
   .then(value=>{if(active)setLive(value.connected===true?value as LiveNeon:null);})
   .catch(()=>{if(active)setLive(null);});
  fetch("/api/reach/connections/neon/saved",{credentials:"same-origin",cache:"no-store"})
   .then(async response=>{if(!response.ok)throw Error("Saved connection registry unavailable");return response.json() as Promise<SavedNeon|{configured:boolean;saved:false}>;})
   .then(value=>{if(active){setVaultConfigured(value.configured===true);setSaved(value.saved===true?value as SavedNeon:null);}})
   .catch(()=>{if(active){setVaultConfigured(false);setSaved(null);}});
  return()=>{active=false;};
 },[]);
 async function disconnect(){
  if(busy)return;
  setBusy(true);setError("");setInfo("");
  try{
   const response=await fetch("/api/reach/connections/neon/live",{
    method:"DELETE",credentials:"same-origin",cache:"no-store",redirect:"error",
    referrerPolicy:"no-referrer"
   });
   if(!response.ok)throw Error("Could not disconnect this Neon session.");
   setLive(null);setResult(null);clearSecret();
   setInfo("Neon session disconnected; no database records or credentials were changed.");
  }catch(cause){setError(cause instanceof Error?cause.message:"Disconnect failed.");}
  finally{setBusy(false);}
 }
 async function removeSaved(){
  if(busy||!window.confirm("Remove the saved Neon credentials from REACH? This does not delete the Neon database."))return;
  setBusy(true);setError("");setInfo("");
  try{
   const response=await fetch("/api/reach/connections/neon/saved",{method:"DELETE",credentials:"same-origin",
    cache:"no-store",redirect:"error",referrerPolicy:"no-referrer"});
   if(!response.ok)throw Error("Could not remove saved Neon connection.");
   setSaved(null);setLive(null);setResult(null);clearSecret();
   setInfo("Saved connection removed. The Neon database was not changed.");
  }catch(cause){setError(cause instanceof Error?cause.message:"Remove failed.");}
  finally{setBusy(false);}
 }
 async function saveLive(){
  if(!live||busy||!vaultConfigured)return;
  setBusy(true);setError("");setInfo("");
  try{
   const response=await fetch("/api/reach/connections/neon/saved",{method:"POST",
    credentials:"same-origin",cache:"no-store",redirect:"error",referrerPolicy:"no-referrer",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({useLiveSession:true})});
   const value:unknown=await response.json();
   if(!response.ok||!value||typeof value!=="object"||!("saved" in value)||value.saved!==true)
    throw Error(value&&typeof value==="object"&&"error" in value&&typeof value.error==="string"?value.error:"Unable to save session.");
   setSaved(value as SavedNeon);
   setInfo("Your currently connected Neon database is now saved in the encrypted owner vault.");
  }catch(cause){setError(cause instanceof Error?cause.message:"Unable to save session.");}
  finally{setBusy(false);}
 }
 const [info,setInfo]=useState("");
 async function verify(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  const submitter=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
  const connect=submitter?.value==="connect";
  const save=submitter?.value==="save";
  setBusy(true);setError("");setResult(null);setInfo("");
  let connectionString="";
  try{
   if(mode==="url")connectionString=dsn.trim();
   else connectionString="postgresql://"+encodeURIComponent(role)+":"+encodeURIComponent(password)+"@"+host.trim().toLowerCase()+"/"+encodeURIComponent(database.trim())+"?sslmode=require";
   const response=await fetch(save?"/api/reach/connections/neon/saved":connect?"/api/reach/connections/neon/live":"/api/reach/connections/neon/verify",{
    method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",
    referrerPolicy:"no-referrer",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({connectionString})
   });
   const value:unknown=await response.json();
   if(!response.ok){
    const msg=value&&typeof value==="object"&&"error" in value&&typeof value.error==="string"?
      value.error:"Connection verification failed.";
    throw Error(msg);
   }
   if(save){
    if(!value||typeof value!=="object"||!("saved" in value)||value.saved!==true||
       !("persisted" in value)||value.persisted!==true)
      throw Error("The server did not confirm permanent encrypted storage.");
    setSaved(value as SavedNeon);
    setInfo("Neon connection saved in the encrypted owner vault; you can disconnect or replace it.");
   }else if(connect){
    if(!value||typeof value!=="object"||!("connected" in value)||value.connected!==true||
      !("persisted" in value)||value.persisted!==false||
      !("storageActivated" in value)||value.storageActivated!==false)
     throw Error("The server did not establish a secure Neon session.");
    setLive(value as LiveNeon);
    setInfo("Neon connected for this owner session. Credentials expire automatically; no workspace data writes are enabled.");
   }else{
    if(!value||typeof value!=="object"||!("verified" in value)||value.verified!==true||
       !("connectionSaved" in value)||value.connectionSaved!==false||
       !("storageActivated" in value)||value.storageActivated!==false)
     throw Error("The server did not confirm a read-only verification.");
    setResult(value as Verification);
   }
  }catch(cause){
   setError(cause instanceof Error?cause.message:"Connection verification failed.");
  }finally{
   clearSecret();connectionString="";setBusy(false);
  }
 }
 return <section className="reach-neon-card" aria-labelledby="reach-neon-heading">
  <div className="reach-neon-heading">
   <div><span className="reach-neon-eyebrow">CUSTOMER CONNECTIONS · READ-ONLY VERIFICATION</span>
    <h2 id="reach-neon-heading">Neon database</h2>
    <p>Enter your own Neon PostgreSQL credentials and run a read-only connection test.</p></div>
   <span className="reach-neon-status">{saved?"Saved · encrypted":live?"Connected · session only":"Not connected"}</span>
  </div>
  <p className="reach-neon-warning"><strong>Secure connection storage:</strong> Save your verified Neon database connection in the encrypted owner vault to retain it across logins. The four-hour session connection remains available. Neither option activates REACH workspace data writes or changes Neon tables or permissions. Use a limited database role.</p>
  <form onSubmit={event=>void verify(event)} autoComplete="off">
   <fieldset className="reach-neon-mode">
    <legend>How would you like to enter the connection?</legend>
    <label><input type="radio" name="neon-entry-mode" checked={mode==="url"} onChange={()=>{setMode("url");clearSecret();setResult(null);setError("");}}/> Paste connection string</label>
    <label><input type="radio" name="neon-entry-mode" checked={mode==="fields"} onChange={()=>{setMode("fields");clearSecret();setResult(null);setError("");}}/> Enter details separately</label>
   </fieldset>
   {mode==="url"?<div className="reach-neon-form-field">
    <label htmlFor="reach-neon-url">Neon connection string</label>
    <input id="reach-neon-url" type="password" value={dsn} onChange={e=>{setDsn(e.target.value);setResult(null);}}
      placeholder="postgresql://role:password@ep-…neon.tech/database?sslmode=require"
      required autoComplete="off" spellCheck={false} disabled={busy}/>
    <small>Copy from Neon → Connect. The string is sent to the read-only test API once and never saved.</small>
   </div>:<div className="reach-neon-fields">
    <div className="reach-neon-form-field"><label htmlFor="reach-neon-host">Hostname</label>
     <input id="reach-neon-host" value={host} onChange={e=>{setHost(e.target.value);setResult(null);}}
      placeholder="ep-example.us-east-2.aws.neon.tech" required disabled={busy} spellCheck={false}/></div>
    <div className="reach-neon-form-field"><label htmlFor="reach-neon-db">Database</label>
     <input id="reach-neon-db" value={database} onChange={e=>{setDatabase(e.target.value);setResult(null);}}
      placeholder="reach_platform" required disabled={busy} spellCheck={false}/></div>
    <div className="reach-neon-form-field"><label htmlFor="reach-neon-role">Database role</label>
     <input id="reach-neon-role" value={role} onChange={e=>{setRole(e.target.value);setResult(null);}}
      placeholder="reach_app_runtime" required disabled={busy} spellCheck={false}/></div>
    <div className="reach-neon-form-field"><label htmlFor="reach-neon-password">Database password</label>
     <input id="reach-neon-password" type="password" value={password} onChange={e=>{setPassword(e.target.value);setResult(null);}}
      required disabled={busy} autoComplete="new-password" spellCheck={false}/></div>
   </div>}
   <details className="reach-neon-optional">
    <summary>Optional Neon project identifiers (informational only)</summary>
    <div className="reach-neon-fields">
     <div className="reach-neon-form-field"><label htmlFor="reach-neon-project">Project ID</label>
      <input id="reach-neon-project" value={project} onChange={e=>setProject(e.target.value)}
        placeholder="red-violet-…" disabled={busy}/></div>
     <div className="reach-neon-form-field"><label htmlFor="reach-neon-branch">Branch ID</label>
      <input id="reach-neon-branch" value={branch} onChange={e=>setBranch(e.target.value)}
        placeholder="br-sweet-frost-…" disabled={busy}/></div>
    </div>
    <small>These labels stay in this form; they are not submitted or authenticated by the SQL connection test.</small>
   </details>
   <div className="reach-neon-actions">
    <button type="submit" value="verify" disabled={busy}>{busy?"Checking Neon…":"Test connection (read-only)"}</button>
    <button type="submit" value="connect" disabled={busy}>{busy?"Connecting…":live?"Replace live session":"Connect Neon (4-hour session)"}</button>
    <button type="submit" value="save" disabled={busy||!vaultConfigured}>{busy?"Saving…":"Save Neon (encrypted)"}</button>
    <span>{vaultConfigured?"Encrypted owner vault available":"Persistent vault setup pending"}</span>
   </div>
  </form>
  {saved&&<div className="reach-neon-verified" role="status">
    <strong>Saved Neon database connection</strong>
    <p>Database: <code>{saved.database}</code> · Role: <code>{saved.role}</code> · Host: <code>{saved.hostname}</code></p>
    <p>Saved across owner logins. This is the owner-only connection registry; workspace data storage and social authorization remain separate.</p>
    <button type="button" disabled={busy} onClick={()=>void removeSaved()}>Remove saved connection</button>
   </div>}
  {live&&<div className="reach-neon-verified" role="status">
   <strong>Neon connected for this session</strong>
   <p>Database: <code>{live.database}</code> · Role: <code>{live.role}</code></p>
   <p>Live link expires: {new Date(live.expiresAt).toLocaleString()}. This connection is not persistent across logins or devices; REACH customer data storage is still gated.</p>
   {vaultConfigured&&!saved&&<button type="button" disabled={busy} onClick={()=>void saveLive()}>Save this live connection</button>}
   <button type="button" disabled={busy} onClick={()=>void disconnect()}>Disconnect Neon</button>
  </div>}
  {info&&<div className="reach-neon-verified" role="status">{info}</div>}
  {result&&<div className="reach-neon-verified" role="status">
   <strong>Read-only connectivity verified</strong>
   <p>Database: <code>{result.database}</code> · Role: <code>{result.role}</code></p>
   <p>Credentials were not saved. Connection status remains <strong>Not connected</strong> until persistent customer credential storage and workspace isolation are approved.</p>
  </div>}
  {error&&<div className="reach-neon-error" role="alert">{error}</div>}
 </section>;
}
