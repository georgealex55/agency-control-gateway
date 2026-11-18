"use client";
import { useEffect, useState } from "react";

type Health={connected:boolean;reason:string;storageReady:boolean;authenticatedWritesEnabled:boolean;authPending:boolean;environment:string;provider:string;externalActionsEnabled:boolean};
const KINDS=[["lead","Lead"],["contact","Contact"],["appointment","Appointment"],["business_profile","Business profile"],["note","Note"]] as const;

export default function ReachConnections(){
  const [health,setHealth]=useState<Health|null>(null);
  const [error,setError]=useState("");
  const [kind,setKind]=useState("lead");
  const [title,setTitle]=useState("");
  const [notes,setNotes]=useState("");
  const [approved,setApproved]=useState(false);
  async function refreshHealth(){
    try {
      const response=await fetch("/api/reach/personal/storage",{cache:"no-store"});
      if(!response.ok)throw new Error("Not available");
      setHealth(await response.json());setError("");
    }catch{setHealth(null);setError("Database health check unavailable");}
  }
  useEffect(()=>{void refreshHealth();},[]);
  const connected=health?.connected===true;
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
      .reachStage .notice{padding:14px;border-radius:10px;background:#202e4d}.reachStage .check{display:flex;align-items:center;gap:9px}.reachStage .check input{width:auto}
    `}</style>
    <div className="wrap">
      <a href="/">← Agency dashboard</a>
      <h1>REACH · Connections</h1>
      <p className="sub">Personal staging workspace. Storage verification is live; owner login and customer data entry remain disabled until Neon Auth activation.</p>
      <section aria-label="Neon database connection">
        <h2>Neon storage · Fieldclock</h2>
        <p><span className={"status "+(connected?"ok":"no")}>{health?(connected?"Verified database connection":"Not connected"):"Checking connection..."}</span></p>
        <p className="sub">{error||(health?.reason==="verified_read_only_query"?"Database schema and restricted runtime role were verified.":health?.reason||"")} </p>
        <p><strong>Storage:</strong> {connected?"Ready":"Unavailable"} &nbsp; <strong>Neon Auth:</strong> {health?.authPending?"Pending activation":"Not yet verified in browser"} &nbsp; <strong>External sends:</strong> Disabled</p>
        <button type="button" onClick={()=>void refreshHealth()}>Check connection again</button>
      </section>
      <div className="grid">
        <section>
          <h2>Secure owner login</h2>
          <p className="notice">Neon Auth activation and verified owner sign-in are required before this page can read or write stored records. The existing offline demo login is not accepted for real database access.</p>
          <p className="sub">No passwords, tokens or provider credentials are entered into this page during preparation.</p>
        </section>
        <section>
          <h2>Manual record entry · Prepared</h2>
          <label htmlFor="recordKind">Record type</label>
          <select id="recordKind" value={kind} onChange={e=>setKind(e.target.value)}>{KINDS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
          <label htmlFor="recordTitle">Name or title</label>
          <input id="recordTitle" value={title} maxLength={160} onChange={e=>setTitle(e.target.value)}/>
          <label htmlFor="recordNotes">Details</label>
          <textarea id="recordNotes" value={notes} maxLength={4000} onChange={e=>setNotes(e.target.value)}/>
          <label className="check"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/> I approve saving this record in staging Neon</label>
          <button type="button" disabled>Save record · Activate Neon Auth first</button>
          <p className="sub">These entries are not transmitted or retained while authentication is pending. The protected API enforces owner verification and explicit write approval.</p>
        </section>
      </div>
      <section><h2>Saved records</h2><p className="sub">A verified Neon Auth owner session is required to list records. The database currently contains no manually entered REACH records.</p></section>
    </div>
  </main>;
}
