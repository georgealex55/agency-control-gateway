"use client";
import {useEffect,useState,type FormEvent} from "react";
type Workspace={id:string;name:string};
export default function OwnerCustomerInvitations(){
 const [workspaces,setWorkspaces]=useState<Workspace[]>([]);
 const [workspaceId,setWorkspaceId]=useState("");
 const [email,setEmail]=useState("");
 const [role,setRole]=useState("viewer");
 const [invitePath,setInvitePath]=useState("");
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  const c=new AbortController();
  fetch("/api/reach/connection-hub",{credentials:"same-origin",cache:"no-store",signal:c.signal})
   .then(async r=>r.ok?r.json():null).then(v=>{if(!c.signal.aborted&&Array.isArray(v?.workspaces)){setWorkspaces(v.workspaces);setWorkspaceId(v.workspaces[0]?.id||"");}})
   .catch(()=>{});
  return()=>c.abort();
 },[]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMessage("");setInvitePath("");
  try{
   const r=await fetch("/api/reach/customer/invitations",{method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId,email:email.trim().toLowerCase(),role})});
   if(!r.ok)throw Error(r.status===503?"Staging invite service is not configured. No invitation was created.":"Invitation could not be created.");
   const data=await r.json() as {invitePath:string;emailSent:false};
   if(!data.invitePath?.startsWith("/customer/invite?token=")||data.emailSent!==false)throw Error("Invalid invitation result");
   setInvitePath(window.location.origin+data.invitePath);setMessage("Invitation created for manual delivery only; no email was sent.");
  }catch(e){setMessage(e instanceof Error?e.message:"Invitation unavailable.");}
  finally{setBusy(false);}
 }
 return <section className="reach-conn-alert" aria-label="Owner customer invitations">
  <h2>Customer workspace invitations · Staging</h2>
  <p>Create a one-time 48-hour invitation for an approved customer. Invitations are not emailed automatically. Customer role is validated again when accepted with a verified Neon Auth email.</p>
  <form onSubmit={e=>void submit(e)} style={{display:"grid",gap:10,maxWidth:520}}>
   <label htmlFor="reach-invite-workspace">Workspace</label>
   <select id="reach-invite-workspace" required value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)} disabled={busy||workspaces.length===0}>
    <option value="">Choose a workspace</option>
    {workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
   </select>
   <label htmlFor="reach-invite-email">Verified customer's email</label>
   <input id="reach-invite-email" required type="email" autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/>
   <label htmlFor="reach-invite-role">Permission</label>
   <select id="reach-invite-role" value={role} onChange={e=>setRole(e.target.value)} disabled={busy}>
    <option value="viewer">Viewer — read only</option>
    <option value="client_editor">Editor — content edits after separate rollout</option>
    <option value="instructor">Instructor — course edits after separate rollout</option>
    <option value="client_owner">Customer owner — manage members after separate rollout</option>
   </select>
   <button type="submit" disabled={busy||!workspaceId}>{busy?"Creating…":"Create invitation (no email)"}</button>
  </form>
  {message&&<p role="status">{message}</p>}
  {invitePath&&<div style={{overflowWrap:"anywhere"}}><strong>Manual invitation link</strong><p>{invitePath}</p>
   <button type="button" onClick={()=>void navigator.clipboard?.writeText(invitePath)}>Copy invitation link</button>
  </div>}
 </section>;
}
