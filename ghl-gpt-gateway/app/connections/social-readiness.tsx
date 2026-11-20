"use client";
import {useEffect,useState} from "react";
import "./social-readiness.css";
type Meta={
 provider:"facebook_pages"|"instagram_professional";
 appConfigured:boolean;missingSettings:string[];permissions:string[];
 callbackUrl:string|null;launchEnabled:boolean;readOnly:true;publishingEnabled:false
};
export default function SocialReadiness({meta,storageApproved}:{meta:Meta[];storageApproved:boolean}){
 const [callback,setCallback]=useState("");
 const [copied,setCopied]=useState(false);
 useEffect(()=>{setCallback(window.location.origin+"/api/platform/social/meta/callback");},[]);
 const ready=storageApproved&&meta.length===2&&meta.every(x=>x.launchEnabled);
 async function copyCallback(){
  if(!callback)return;
  try{await navigator.clipboard.writeText(callback);setCopied(true);}
  catch{setCopied(false);}
 }
 return <section className="reach-social-readiness" aria-labelledby="social-connect-title">
  <div className="reach-social-head"><div>
   <span className="reach-social-eyebrow">STEP 2 · SOCIAL CONNECTIONS</span>
   <h2 id="social-connect-title">Facebook & Instagram setup</h2>
   <p>Connect business-owned profiles by explicit Meta authorization. REACH only requests read-only access during this phase.</p>
  </div><span className="reach-social-state">{ready?"Read-only authorization ready":"Additional setup required"}</span></div>
  <div className="reach-social-status">
   <div><strong>Workspace records</strong><span>{storageApproved?"Approved":"Migration and role approval pending"}</span></div>
   <div><strong>Facebook Pages</strong><span>{meta.find(x=>x.provider==="facebook_pages")?.launchEnabled?"Ready for consent":"Developer setup required"}</span></div>
   <div><strong>Instagram Professional</strong><span>{meta.find(x=>x.provider==="instagram_professional")?.launchEnabled?"Ready for consent":"Developer setup required"}</span></div>
   <div><strong>Publishing & messaging</strong><span>Disabled</span></div>
  </div>
  <div className="reach-social-config">
   <strong>Meta OAuth callback URL</strong>
   <div><code>{callback||"Loading callback address…"}</code>
    <button type="button" disabled={!callback} onClick={()=>void copyCallback()}>{copied?"Copied":"Copy"}</button></div>
   <small>Use this exact HTTPS callback in your Meta developer app. App secrets stay server-side, never in customer login forms.</small>
  </div>
  <div className="reach-social-providers">
   {meta.map(item=><div key={item.provider}>
     <strong>{item.provider==="facebook_pages"?"Facebook Pages":"Instagram Professional"}</strong>
     <span>{item.launchEnabled?"Consent button available":"Not authorized"}</span>
     <p>Read-only permissions: {item.permissions.join(", ")||"Provider setup required"}</p>
     {item.missingSettings.length>0&&<details><summary>Missing developer configuration ({item.missingSettings.length})</summary>
       <div>{item.missingSettings.map(s=><code key={s}>{s}</code>)}</div>
     </details>}
   </div>)}
  </div>
  <p className="reach-social-hint">Your customers should not need to provide a Meta developer app secret. Once the REACH platform app is configured and customer storage is approved, the customer authorizes their actual Page or Instagram Professional account through Meta's consent screen.</p>
  <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Open Meta Developer Apps</a>
 </section>;
}
