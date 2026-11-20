"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import "./login.css";

type Session={configured:boolean;authenticated:boolean};
const destination=(value:string|null)=>value==="/connections"||value==="/"?value:"/";
export default function OwnerLogin(){
 const [session,setSession]=useState<Session|null>(null);
 const [password,setPassword]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [verified,setVerified]=useState(false);
 const [next,setNext]=useState("/");
 useEffect(()=>{
  setNext(destination(new URLSearchParams(window.location.search).get("next")));
  const controller=new AbortController();
  fetch("/api/portal/session",{credentials:"same-origin",cache:"no-store",signal:controller.signal})
   .then(async response=>{if(!response.ok)throw Error("Could not verify owner sign-in");return response.json();})
   .then(data=>{if(!controller.signal.aborted)setSession({configured:data.configured===true,authenticated:data.authenticated===true});})
   .catch(()=>{if(!controller.signal.aborted)setError("Sign-in status is temporarily unavailable. Retry from this page.");})
   .finally(()=>{if(!controller.signal.aborted)setVerified(true);});
  return()=>controller.abort();
 },[]);
 async function signIn(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");
  try{
   const response=await fetch("/api/portal/session",{method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
   const value=await response.json();
   if(!response.ok||value.authenticated!==true){
    if(response.status===401)throw Error("Password mismatch (401). Enter the original password that generated your CURRENT production SHA-256 hash, not the hash itself or the previous temporary password.");
    if(response.status===403)throw Error("Origin check blocked sign-in (403). Open the official REACH login address and try again.");
    if(response.status===503)throw Error("Production owner credentials are not configured (503). Check the two private Vercel environment variables and redeploy.");
    throw Error("Sign-in request failed (HTTP "+response.status+"). Check the current deployment and retry.");
   }
   // Verify the newly set HttpOnly cookie before leaving this page.
   const verified=await fetch("/api/portal/session",{credentials:"same-origin",cache:"no-store"});
   const verifiedSession=verified.ok?await verified.json():null;
   if(verifiedSession?.authenticated!==true)throw Error("Password accepted, but the browser did not retain the owner session cookie. Check browser cookie settings and retry.");
   setPassword("");
   window.location.assign(next);
  }catch(e){setError(e instanceof Error?e.message:"Sign-in failed");}
  finally{setBusy(false);}
 }
 return <main className="reach-auth">
  <div className="reach-auth-card">
   <div className="reach-auth-mark">R<span>•</span></div>
   <p className="reach-auth-eyebrow">REACH BUSINESS OPERATING SYSTEM</p>
   <h1>Welcome back.</h1>
   <p className="reach-auth-muted">Sign in to manage your workspace, Connections, and approved account integrations.</p>
   <p className="reach-auth-muted">If you recently changed the SHA-256 value in Vercel, use the password that created the new hash. Never paste the hash into this password field.</p>
   {!verified?<p role="status">Checking owner session…</p>:null}
   {verified&&!session?.configured?<section className="reach-auth-status" role="status">
    <strong>Owner login setup required</strong>
    <p>The owner login uses a private password hash and server-side session secret. Configure these in Vercel production environment settings; do not add passwords or secrets to source code.</p>
    <code>AGENCY_PORTAL_PASSWORD_SHA256</code>
    <code>AGENCY_PORTAL_SESSION_SECRET</code>
   </section>:null}
   {session?.authenticated?<div className="reach-auth-status"><strong>You are signed in.</strong><p>Your protected workspace is ready to open.</p><Link className="reach-auth-action" href={next}>Continue to REACH</Link></div>:
   <form onSubmit={signIn} aria-label="Owner sign-in">
    <label htmlFor="reach-owner-password">Owner password</label>
    <input id="reach-owner-password" name="password" type="password" autoComplete="current-password" minLength={12}
     value={password} onChange={e=>setPassword(e.target.value)} disabled={busy||!session?.configured} required/>
    <button type="submit" disabled={busy||!session?.configured||password.length<12}>
     {busy?"Signing in…":"Sign in securely"}
    </button>
   </form>}
   {error&&<p role="alert" className="reach-auth-error">{error}</p>}
   <p className="reach-auth-foot"><Link href="/">← REACH home</Link> · Passwords are not stored in the browser.</p>
  </div>
 </main>;
}
