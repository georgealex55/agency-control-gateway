"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {customerAuthClient} from "@/lib/reach-customer-neon-client";
type Workspace={id:string;name:string;slug:string;role:"client_owner"|"client_editor"|"instructor"|"viewer"};
export default function CustomerWorkspaces(){
 const [loading,setLoading]=useState(true);
 const [workspaces,setWorkspaces]=useState<Workspace[]>([]);
 const [message,setMessage]=useState("");
 const [authenticated,setAuthenticated]=useState(false);
 const [signingOut,setSigningOut]=useState(false);
 async function signOut(){
  setSigningOut(true);setMessage("");
  try{
   const upstream=await customerAuthClient.signOut();
   const local=await fetch("/api/reach/customer/session",{method:"DELETE",credentials:"same-origin",cache:"no-store"});
   if(!local.ok||upstream.error)throw Error("Sign-out was incomplete. The managed identity session may still be active.");
   window.location.assign("/customer/sign-in");
  }catch(e){setMessage(e instanceof Error?e.message:"Could not complete sign-out");}
  finally{setSigningOut(false);}
 }
 useEffect(()=>{
  const controller=new AbortController();
  fetch("/api/reach/customer/workspaces",{credentials:"same-origin",cache:"no-store",signal:controller.signal})
   .then(async r=>{
    if(r.status===401){setMessage("Customer sign-in required. REACH customer identity onboarding is not activated yet.");return null;}
    if(r.status===503){setMessage("Customer sign-in is awaiting Neon Auth and an isolated membership database.");return null;}
    if(!r.ok)throw Error("Your workspace access is currently unavailable");
    return r.json() as Promise<{workspaces:Workspace[];readOnly:true}>;
   })
   .then(v=>{if(!controller.signal.aborted&&v){if(!Array.isArray(v.workspaces)||v.readOnly!==true)throw Error("Invalid workspace response");setWorkspaces(v.workspaces);setAuthenticated(true);}})
   .catch(e=>{if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:"Workspace access unavailable");})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[]);
 return <main style={{minHeight:"100dvh",background:"#0c1124",color:"#eff1ff",fontFamily:"system-ui,sans-serif",padding:"32px 18px"}}>
  <div style={{maxWidth:780,margin:"0 auto"}}>
   <nav style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}><Link href="/" style={{color:"#bfb3ff"}}>← REACH</Link>{authenticated&&<button type="button" disabled={signingOut} onClick={()=>void signOut()} style={{padding:"7px 12px",borderRadius:8}}>{signingOut?"Signing out…":"Sign out"}</button>}</nav>
   <p style={{marginTop:36,fontSize:12,letterSpacing:2,color:"#aa9cff"}}>REACH · CUSTOMER WORKSPACES</p>
   <h1>Your business workspaces</h1>
   <p style={{color:"#b4bfd6"}}>Only workspaces granted to your verified customer identity appear here. Platform developer credentials and account secrets stay private.</p>
   {loading&&<p role="status">Checking customer access…</p>}
   {message&&<section role="status" style={{border:"1px solid #5e6680",borderRadius:14,padding:20,marginTop:26}}>{message}</section>}
   {authenticated&&workspaces.length===0&&<p role="status">No REACH workspaces are assigned to this customer identity.</p>}
   {authenticated&&workspaces.map(w=><article key={w.id} style={{border:"1px solid #46516b",borderRadius:14,padding:20,marginTop:16,background:"#19243b"}}>
    <h2 style={{margin:"0 0 6px",fontSize:20}}>{w.name}</h2>
    <p style={{color:"#b4bfd6",margin:0}}>Role: {w.role.replaceAll("_"," ")} · Workspace: {w.slug}</p>
    <small style={{color:"#9facca"}}>Access is read-only at this stage. External actions remain disabled.</small>
   </article>)}
  </div>
 </main>;
}
