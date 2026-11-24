"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import "@/app/connections/connections.css";
export default function CustomerInvite(){
 const [token,setToken]=useState("");
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{const t=new URLSearchParams(window.location.search).get("token")||"";setToken(/^[A-Za-z0-9_-]{43}$/.test(t)?t:"");},[]);
 async function accept(){
  if(!token)return;setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/reach/customer/invitations/accept",{method:"POST",
    credentials:"same-origin",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({token})});
   if(response.status===401){setMessage("Sign in with the verified email address for this invitation, then return to this link.");return;}
   if(!response.ok)throw Error(response.status===409?"This invitation has expired, was already accepted, or does not match your verified email.":"Invitation service unavailable.");
   window.location.assign("/customer/workspaces");
  }catch(e){setMessage(e instanceof Error?e.message:"Invitation could not be accepted.");}
  finally{setBusy(false);}
 }
 const encoded=encodeURIComponent(token);
 return <main className="reach-conn"><div className="reach-conn-wrap" style={{maxWidth:590}}>
  <nav><Link href="/">← REACH</Link></nav>
  <p className="reach-conn-eyebrow">REACH · PRIVATE CUSTOMER INVITATION</p><h1>Join your business workspace</h1>
  <p>Invitations are limited to the specified recipient's verified email, expire after 48 hours, and may be used only once. An invitation cannot connect social accounts or grant developer access.</p>
  {!token?<p role="alert" className="reach-conn-error">Valid invitation token required.</p>:<>
   <button disabled={busy} onClick={()=>void accept()}>{busy?"Checking…":"Accept invitation"}</button>
   <p>Not signed in? <Link href={"/customer/sign-in?invite="+encoded}>Customer sign-in</Link> · <Link href={"/customer/register?invite="+encoded}>Create a verified account</Link></p>
  </>}
  {message&&<p role="status" className="reach-conn-error">{message}</p>}
 </div></main>;
}
