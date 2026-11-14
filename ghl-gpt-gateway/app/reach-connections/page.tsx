"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createAuthClient } from "@neondatabase/auth";

type Health={
  connected:boolean;reason:string;storageReady:boolean;authenticatedWritesEnabled:boolean;
  authPending:boolean;environment:string;provider:string;externalActionsEnabled:boolean;
};
type RecordItem={id:string;kind:string;title:string;notes:string;created_at:string};
const KINDS=[["lead","Lead"],["contact","Contact"],["appointment","Appointment"],
  ["business_profile","Business profile"],["note","Note"]] as const;
function tokenFromSession(result:unknown):string|null {
  const obj=result as {data?:{session?:{access_token?:string;accessToken?:string}}}|null;
  const value=obj?.data?.session?.access_token || obj?.data?.session?.accessToken;
  return typeof value==="string"&&value.length>20?value:null;
}
export default function ReachConnections(){
  const auth=useMemo(()=>{
    const base=process.env.NEXT_PUBLIC_REACH_NEON_AUTH_URL;
    return base&&/^https:\/\//.test(base)?createAuthClient(base):null;
  },[]);
  const [health,setHealth]=useState<Health|null>(null);
  const [healthError,setHealthError]=useState("");
  const [token,setToken]=useState<string|null>(null);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [title,setTitle]=useState("");
  const [kind,setKind]=useState("lead");
  const [notes,setNotes]=useState("");
  const [approved,setApproved]=useState(false);
  const [items,setItems]=useState<RecordItem[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function refreshHealth(){
    try{
      const response=await fetch("/api/reach/personal/storage",{cache:"no-store"});
      if(!response.ok)throw Error("Connection check unavailable");
      setHealth(await response.json());setHealthError("");
    }catch{setHealthError("Unable to verify database connection");}
  }
  async function loadRecords(t:string){
    try{
      const response=await fetch("/api/reach/personal/records",{cache:"no-store",headers:{"Authorization":"Bearer "+t}});
      if(!response.ok){setItems([]);setMessage("Owner access is not yet authorized for storage");return;}
      const data=await response.json();setItems(Array.isArray(data.records)?data.records:[]);
    }catch{setMessage("Records could not be loaded");}
  }
  useEffect(()=>{
    void refreshHealth();
    if(auth)void auth.getSession().then(session=>{
      const access=tokenFromSession(session);setToken(access);
      if(access)void loadRecords(access);
    }).catch(()=>setToken(null));
  },[auth]);
  async function signIn(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!auth)return;
    setBusy(true);setMessage("");
    try{
      const result=await auth.signIn.email({email,password});
      if(result.error){setMessage(result.error.message||"Sign-in unsuccessful");return;}
      const session=await auth.getSession();
      const access=tokenFromSession(session);setToken(access);
      if(access){setMessage("Owner session verified");await loadRecords(access);}
      else setMessage("Signed in, but a usable access token has not been issued");
    }catch{setMessage("Authentication was not completed");}
    finally{setPassword("");setBusy(false);}
  }
  async function signOut(){
    if(auth)try{await auth.signOut();}catch{}
    setToken(null);setItems([]);setMessage("Signed out");
  }
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!token||!health?.authenticatedWritesEnabled||!approved)return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/reach/personal/records",{
        method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
        body:JSON.stringify({kind,title:title.trim(),notes:notes.trim(),approved:true,requestId:crypto.randomUUID()})
      });
      const data=await response.json();
      if(!response.ok){setMessage(data.error||"Save failed");return;}
      setMessage(data.duplicate?"This request was already saved":"Saved to Fieldclock Neon");
      setTitle("");setNotes("");setApproved(false);await loadRecords(token);
    }catch{setMessage("Unable to save this record");}
    finally{setBusy(false);}
  }
  const ready=health?.connected===true;
  const canWrite=ready&&health?.authenticatedWritesEnabled&&!!token;
  return <main className="reachStage">
    <style>{`
      .reachStage{min-height:100vh;padding:32px 5vw;background:#0b1024;color:#eef1ff;font:16px system-ui,sans-serif}
      .reachStage a{color:#b4c5ff}.reachStage .wrap{max-width:1000px;margin:auto}
      .reachStage h1{font-size:30px;margin:10px 0}.reachStage h2{font-size:19px;margin:0 0 14px}
      .reachStage p{line-height:1.55}.reachStage .sub{color:#aebad8}
      .reachStage .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-top:22px}
      .reachStage section{background:#151f39;border:1px solid #344263;border-radius:16px;padding:23px;margin-top:22px}
      .reachStage label{display:block;margin:12px 0 5px}.reachStage input:not([type=checkbox]),.reachStage select,.reachStage textarea{width:100%;padding:11px;border-radius:9px;background:#0b142c;border:1px solid #52617f;color:#fff;font:inherit}
      .reachStage textarea{min-height:95px}.reachStage button{padding:11px 16px;background:#6655df;color:white;border:0;border-radius:9px;margin-top:15px;cursor:pointer}
      .reachStage button:disabled{opacity:.45;cursor:not-allowed}.reachStage button:focus-visible,.reachStage a:focus-visible{outline:3px solid #abbeff}
      .reachStage .status{display:inline-block;padding:7px 12px;border-radius:99px;background:#293653}.reachStage .ok{background:#185c44}.reachStage .no{background:#5a3440}
      .reachStage .notice{padding:14px;border-radius:10px;background:#202e4d}.reachStage .records{list-style:none;padding:0}.reachStage .records li{border-bottom:1px solid #394564;padding:12px 0}.reachStage small{display:block;color:#aebad8}
      .reachStage .check{display:flex;align-items:center;gap:9px}.reachStage .check input{width:auto}
    `}</style>
    <div className="wrap">
      <a href="/">← Agency dashboard</a>
      <h1>REACH · Connections</h1>
      <p className="sub">Personal staging workspace. Neon database storage is separate from social, email and outbound integrations.</p>
      <section aria-label="Neon database connection">
        <h2>Neon storage · Fieldclock</h2>
        <p><span className={"status "+(ready?"ok":"no")}>{health?(ready?"Verified database connection":"Not connected"):"Checking connection..."}</span></p>
        <p className="sub">{healthError||(health?.reason==="verified_read_only_query"?"The application verified the staging database using its restricted server-side role.":health?.reason||"")} </p>
        <p><strong>Storage:</strong> {ready?"Ready":"Unavailable"} &nbsp; <strong>Neon Auth:</strong> {health?.authPending?"Pending activation":"Configured"} &nbsp; <strong>External sends:</strong> Disabled</p>
        <button type="button" onClick={()=>void refreshHealth()}>Check connection again</button>
      </section>
      <div className="grid">
        <section>
          <h2>Secure owner login</h2>
          {!auth?<p className="notice">Neon Auth is not provisioned yet. Staging storage is connected, but reading and writing records requires verified owner authentication.</p>
          :token?<><p className="notice">Authenticated owner session is active.</p><button type="button" onClick={()=>void signOut()}>Sign out</button></>
          :<form onSubmit={signIn}><label htmlFor="authEmail">Owner email</label>
            <input id="authEmail" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/>
            <label htmlFor="authPassword">Password</label>
            <input id="authPassword" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/>
            <button disabled={busy} type="submit">Sign in with Neon Auth</button></form>}
        </section>
        <section>
          <h2>Add a record</h2>
          <form onSubmit={save}>
            <label htmlFor="recordKind">Record type</label>
            <select id="recordKind" value={kind} onChange={e=>setKind(e.target.value)}>{KINDS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
            <label htmlFor="recordTitle">Name or title</label>
            <input id="recordTitle" value={title} maxLength={160} onChange={e=>setTitle(e.target.value)} required/>
            <label htmlFor="recordNotes">Details</label>
            <textarea id="recordNotes" maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)}/>
            <label className="check"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/> I approve saving this record in staging Neon</label>
            <button type="submit" disabled={!canWrite||!approved||busy||!title.trim()}>Save record</button>
            {!canWrite&&<p className="sub">Saving unlocks after Neon Auth verifies the authorized owner.</p>}
          </form>
        </section>
      </div>
      {message&&<p className="notice" role="status">{message}</p>}
      <section><h2>Saved records</h2>
        {!token?<p className="sub">Sign in as the verified owner to view saved data.</p>
        :items.length===0?<p className="sub">No records in this workspace yet.</p>
        :<ul className="records">{items.map(item=><li key={item.id}><strong>{item.title}</strong> · {item.kind}
          <small>{item.notes}</small><small>{new Date(item.created_at).toLocaleString()}</small></li>)}</ul>}
      </section>
    </div>
  </main>;
}
