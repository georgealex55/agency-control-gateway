"use client";
import {useEffect,useState,type FormEvent} from "react";
type Seat={id:string;name:string;email:string|null;role:string;status:"active"|"reserved"|"disabled";isAdmin:boolean;createdAt:string};
type Registry={maxUsers:number;used:number;remaining:number;users:Seat[];individualLoginEnabled:false;invitationDeliveryEnabled:false};
export default function UserSeats(){
 const [registry,setRegistry]=useState<Registry|null>(null),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [name,setName]=useState(""),[email,setEmail]=useState(""),[role,setRole]=useState("client_editor");
 async function load(){
  setError("");
  try{const r=await fetch("/api/platform/users",{credentials:"same-origin",cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error||"Seat registry unavailable");setRegistry(j);}
  catch(e){setError(e instanceof Error?e.message:"Cannot load seats");}
 }
 useEffect(()=>{void load();},[]);
 async function reserve(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   const r=await fetch("/api/platform/users",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,role})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Unable to reserve seat");
   setName("");setEmail("");setNotice("Seat reserved. No invitation was sent and no login was created.");await load();
  }catch(e){setError(e instanceof Error?e.message:"Seat reservation failed");}finally{setBusy(false);}
 }
 async function change(id:string,action:"disable"|"reserve"){
  setBusy(true);setError("");setNotice("");
  try{
   const r=await fetch("/api/platform/users/"+encodeURIComponent(id),{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Unable to change reservation");
   setNotice(action==="disable"?"Seat disabled and capacity released.":"Seat reserved again; no login granted.");await load();
  }catch(e){setError(e instanceof Error?e.message:"Seat update failed");}finally{setBusy(false);}
 }
 return <div className="ag-platform-section">
  <div className="ag-eyebrow">AGENCY ACCESS · FIVE-SEAT LIMIT</div>
  <h1>Manage your five user seats.</h1>
  <p className="ag-subhead">One agency administrator plus up to four reserved individual accounts. The database enforces the limit, including concurrent requests.</p>
  <div className="ag-social-stats">
   {([["Maximum users",registry?.maxUsers??5],["Occupied seats",registry?.used??"—"],["Seats available",registry?.remaining??"—"]] as [string,number|string][]).map(([name,value])=><div className="ag-metric" key={name}><div><span>{name}</span></div><strong>{value}</strong><small>Agency-wide</small></div>)}
  </div>
  {error&&<div className="ag-error" role="alert">{error}</div>}
  {notice&&<div className="ag-ws-note" role="status">{notice}</div>}
  <div className="ag-workspace-layout">
   <section className="ag-card"><div className="ag-platform-bar"><div><h2>Account roster</h2><p>{registry?.used??"—"} of 5 occupied</p></div><button className="ag-secondary" onClick={()=>void load()} disabled={busy}>Refresh</button></div>
   <div className="ag-social-list">{registry?.users.map(u=><div className="ag-tenant" key={u.id}><span className="ag-tenant-icon">{u.isAdmin?"★":"◈"}</span><span><b>{u.name}</b><small>{u.email??"Agency administrator"} · {u.role} · {u.status}</small></span>{!u.isAdmin&&<button className="ag-secondary" onClick={()=>void change(u.id,u.status==="disabled"?"reserve":"disable")} disabled={busy}>{u.status==="disabled"?"Reserve":"Disable"}</button>}</div>)}</div></section>
   <section className="ag-card"><h2>Reserve a seat</h2><p>Reservations claim a place within the five-user cap. They do not send email or grant access.</p>
    <form className="ag-ws-form" onSubmit={reserve}>
     <label>Display name<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={120} required placeholder="Team member"/></label>
     <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="team@example.com"/></label>
     <label>Intended role<select value={role} onChange={e=>setRole(e.target.value)}><option value="client_owner">Client owner</option><option value="client_editor">Client editor</option><option value="viewer">Viewer</option></select></label>
     <button className="ag-primary" disabled={busy||!registry||registry.remaining===0}>{busy?"Saving…":registry?.remaining===0?"Five-seat limit reached":"Reserve user seat"}</button>
    </form>
    <div className="ag-ws-note"><b>Individual sign-in is not active.</b><p>Existing administrator password access remains provisional. User identities and verified invitations will be enabled only after role-based session enforcement is implemented.</p></div>
   </section>
  </div>
  <p className="ag-footnote">Five seats total, not per workspace. Disabled reservations do not consume a seat. No external client, social, GHL or billing access is created here.</p>
 </div>;
}
