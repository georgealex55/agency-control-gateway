"use client";
import {useState,type FormEvent} from "react";
import "./neon-customer-card.css";

type Mode="url"|"fields";
type Verification={verified:true;connectionSaved:false;storageActivated:false;database:string;role:string;check:"read_only_select";note:string};

/** Owner-only onboarding test; no browser or server credential persistence. */
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
 const [error,setError]=useState("");
 const clearSecret=()=>{setDsn("");setPassword("");};
 async function verify(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  setBusy(true);setError("");setResult(null);
  let connectionString="";
  try{
   if(mode==="url")connectionString=dsn.trim();
   else connectionString="postgresql://"+encodeURIComponent(role)+":"+encodeURIComponent(password)+"@"+host.trim().toLowerCase()+"/"+encodeURIComponent(database.trim())+"?sslmode=require";
   const response=await fetch("/api/reach/connections/neon/verify",{
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
   if(!value||typeof value!=="object"||!("verified" in value)||value.verified!==true||
      !("connectionSaved" in value)||value.connectionSaved!==false||
      !("storageActivated" in value)||value.storageActivated!==false)
    throw Error("The server did not confirm a read-only verification.");
   setResult(value as Verification);
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
   <span className="reach-neon-status">Not saved</span>
  </div>
  <p className="reach-neon-warning"><strong>Verification only:</strong> This form does not store credentials, activate REACH production storage, create tables, change permissions, or connect customer records. Use a limited database role rather than an owner/admin role.</p>
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
    <button type="submit" disabled={busy}>{busy?"Checking Neon…":"Test connection (read-only)"}</button>
    <span>No credentials are saved</span>
   </div>
  </form>
  {result&&<div className="reach-neon-verified" role="status">
   <strong>Read-only connectivity verified</strong>
   <p>Database: <code>{result.database}</code> · Role: <code>{result.role}</code></p>
   <p>Credentials were not saved. Connection status remains <strong>Not connected</strong> until persistent customer credential storage and workspace isolation are approved.</p>
  </div>}
  {error&&<div className="reach-neon-error" role="alert">{error}</div>}
 </section>;
}
