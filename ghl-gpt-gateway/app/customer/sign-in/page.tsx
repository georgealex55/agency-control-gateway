"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {customerAuthClient} from "@/lib/reach-customer-neon-client";

export default function CustomerSignIn(){
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [configured,setConfigured]=useState<boolean|null>(null);
 useEffect(()=>{
  const c=new AbortController();
  fetch("/api/reach/customer/session",{credentials:"same-origin",cache:"no-store",signal:c.signal})
   .then(async r=>{if(!c.signal.aborted){setConfigured(r.status!==503);if(r.ok){const j=await r.json();if(j.authenticated)window.location.assign("/customer/workspaces");}}})
   .catch(()=>{if(!c.signal.aborted)setConfigured(false);});
  return()=>c.abort();
 },[]);
 async function signIn(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setStatus("");setBusy(true);
  try{
   const result=await customerAuthClient.signIn.email({email:email.trim().toLowerCase(),password});
   if(result.error)throw Error("Credentials could not be verified; check email verification and try again.");
   const token=await customerAuthClient.token();
   if(token.error||!token.data?.token)throw Error("Neon Auth session token unavailable.");
   const r=await fetch("/api/reach/customer/session",{method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({assertion:token.data.token}),cache:"no-store"});
   if(!r.ok)throw Error(r.status===403?"This verified identity is not assigned to a REACH workspace.":"Customer access not yet approved.");
   setPassword("");window.location.assign("/customer/workspaces");
  }catch(e){setStatus(e instanceof Error?e.message:"Sign-in unavailable.");}
  finally{setBusy(false);}
 }
 return <main className="reach-conn" style={{minHeight:"100dvh",padding:"32px 18px"}}>
  <div style={{maxWidth:460,margin:"32px auto"}}>
   <nav><Link href="/" style={{color:"#c8baff"}}>← REACH</Link></nav>
   <p className="reach-conn-eyebrow">REACH · CUSTOMER SIGN-IN</p>
   <h1>Access your workspace</h1>
   <p style={{color:"#b4bfd6"}}>This is a customer identity sign-in, separate from REACH developer access. Only verified invited members can open assigned workspaces.</p>
   {configured===null&&<p role="status">Checking customer sign-in readiness…</p>}
   {configured===false&&<p role="status" className="reach-conn-alert">Customer sign-in is not enabled for this environment.</p>}
   <form onSubmit={e=>void signIn(e)} style={{display:"grid",gap:14,marginTop:25}}>
    <label htmlFor="customer-email">Email</label>
    <input id="customer-email" required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} disabled={busy||configured!==true} style={{padding:11,borderRadius:8}}/>
    <label htmlFor="customer-password">Password</label>
    <input id="customer-password" required type="password" autoComplete="current-password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy||configured!==true} style={{padding:11,borderRadius:8}}/>
    <button type="submit" disabled={busy||configured!==true}>{busy?"Verifying…":"Sign in securely"}</button>
   </form>
   {status&&<p role="alert" className="reach-conn-error">{status}</p>}
   <p style={{marginTop:22,fontSize:12,color:"#adb8ce"}}>Have an invitation? Sign in using the email address that received it, and verify your address with Neon Auth before accepting access.</p>
  </div>
 </main>;
}
