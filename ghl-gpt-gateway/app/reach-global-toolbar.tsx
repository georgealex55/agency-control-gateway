"use client";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import {REACH_FEATURES,REACH_GROUPS,featureHref,featureLabel} from "./reach-ui-23";
import styles from "./reach-global-toolbar.module.css";
export default function ReachGlobalToolbar(){
 const pathname=usePathname();
 const [authenticated,setAuthenticated]=useState(false);
 const [open,setOpen]=useState<string|null>(null);
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{
  let active=true;
  async function check(){
   try{const res=await fetch("/api/portal/session",{cache:"no-store",credentials:"same-origin"});const data=await res.json();if(active)setAuthenticated(res.ok&&data.authenticated===true);}
   catch{if(active)setAuthenticated(false);}
  }
  void check();
  const update=()=>void check();
  window.addEventListener("reach-session-change",update);
  return()=>{active=false;window.removeEventListener("reach-session-change",update);};
 },[pathname]);
 useEffect(()=>{setOpen(null);setMobile(false);},[pathname]);
 useEffect(()=>{
  const close=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(null);setMobile(false);}};
  window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);
 },[]);
 if(!authenticated||pathname==="/login")return null;
 const groups=REACH_GROUPS.filter(g=>g!=="Workspace");
 return <header className={styles.bar} data-reach-global-toolbar="true">
  <a className={styles.brand} href="/" aria-label="REACH command center"><span>R</span><strong>REACH</strong></a>
  <button type="button" className={styles.mobileToggle} onClick={()=>{setMobile(v=>!v);setOpen(null);}} aria-expanded={mobile} aria-controls="reach-global-menu">Menu {mobile?"−":"☰"}</button>
  <nav id="reach-global-menu" className={styles.nav+(mobile?" "+styles.mobileOpen:"")} aria-label="Global REACH navigation">
   <a className={styles.direct} href="/">Home</a>
   {groups.map(group=><div className={styles.group} key={group}>
    <button type="button" className={styles.trigger} aria-expanded={open===group} onClick={()=>setOpen(v=>v===group?null:group)}>{group}<span aria-hidden="true">{open===group?"▴":"▾"}</span></button>
    {open===group&&<div className={styles.menu}>{REACH_FEATURES.filter(f=>f.group===group).map(f=>{const href=featureHref(f);return href?<a key={f.id} href={href} onClick={()=>{setOpen(null);setMobile(false);}}>{f.title}{f.status==="source"&&<small>Setup</small>}</a>:<span className={styles.unavailable} key={f.id} title={f.detail}>{f.title}<small>{featureLabel(f)}</small></span>;})}</div>}
   </div>)}
   <a className={styles.direct} href="/connections">Connections</a>
   <a className={styles.direct} href="/?view=directory">All tools</a>
  </nav>
 </header>;
}
