"use client";
import {useEffect,useState,type FormEvent} from "react";
import "./social-readiness.css";
type Provider="facebook_pages"|"instagram_professional";
type Meta={
 provider:Provider;
 appConfigured:boolean;missingSettings:string[];permissions:string[];
 callbackUrl:string|null;launchEnabled:boolean;duplicateAppId:boolean;readOnly:true;publishingEnabled:false
};
type AppStatus={provider:Provider;configured:boolean;clientIdMasked:string|null;updatedAt:string|null};
const safeAppUrl="https://developers.facebook.com/apps/";
/**
 * Owner-only Meta developer app setup. The real Facebook/Instagram connection
 * is created separately through Meta's external consent window.
 */
export default function SocialReadiness({meta,storageApproved,onConfigured}:{
 meta:Meta[];storageApproved:boolean;onConfigured:()=>void
}){
 const [callback,setCallback]=useState("");
 const [copied,setCopied]=useState(false);
 const [available,setAvailable]=useState(false);
 const [apps,setApps]=useState<AppStatus[]>([]);
 const [appId,setAppId]=useState<Record<Provider,string>>({facebook_pages:"",instagram_professional:""});
 const [appSecret,setAppSecret]=useState<Record<Provider,string>>({facebook_pages:"",instagram_professional:""});
 const [working,setWorking]=useState<Provider|null>(null);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 useEffect(()=>{
  setCallback(window.location.origin+"/api/platform/social/meta/callback");
  let active=true;
  fetch("/api/reach/connections/meta-apps",{credentials:"same-origin",cache:"no-store"})
   .then(async r=>{if(!r.ok)throw Error("App configuration status is unavailable");return r.json() as Promise<{enabled:boolean;apps:AppStatus[]}>;})
   .then(r=>{if(active){setAvailable(r.enabled===true);setApps(Array.isArray(r.apps)?r.apps:[]);}})
   .catch(()=>{if(active)setAvailable(false);});
  return()=>{active=false;};
 },[]);
 const ready=storageApproved&&meta.length===2&&meta.every(x=>x.launchEnabled);
 async function copyCallback(){
  if(!callback)return;
  try{await navigator.clipboard.writeText(callback);setCopied(true);}
  catch{setCopied(false);}
 }
 async function saveApp(e:FormEvent<HTMLFormElement>,provider:Provider){
  e.preventDefault();if(working||!available)return;
  const id=appId[provider].trim(),secret=appSecret[provider];
  if(!/^[0-9]{6,32}$/.test(id)||secret.length<8||secret.length>1024){
   setError("Enter the provider's numeric application ID and complete application secret.");
   return;
  }
  setWorking(provider);setError("");setMessage("");
  try{
   const response=await fetch("/api/reach/connections/meta-apps",{
    method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",
    referrerPolicy:"no-referrer",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({provider,clientId:id,clientSecret:secret})
   });
   if(!response.ok)throw Error("Could not save application settings. Check the owner session and app vault.");
   const result=await response.json() as {app:AppStatus;credentialsEncrypted:boolean;accountConnected:false};
   if(result.credentialsEncrypted!==true||result.accountConnected!==false||result.app?.provider!==provider)
    throw Error("Meta application settings were not confirmed.");
   setApps(old=>[...old.filter(a=>a.provider!==provider),result.app]);
   setMessage("Encrypted Meta app credentials saved. You can now use the provider's Connect button when readiness checks pass.");
   onConfigured();
  }catch(cause){setError(cause instanceof Error?cause.message:"Meta setup failed.");}
  finally{
   setAppSecret(old=>({...old,[provider]:""}));
   setWorking(null);
  }
 }
 return <section className="reach-social-readiness" aria-labelledby="social-connect-title">
  <div className="reach-social-head"><div>
   <span className="reach-social-eyebrow">STEP 2 · SOCIAL CONNECTIONS</span>
   <h2 id="social-connect-title">Facebook & Instagram setup</h2>
   <p>Configure your Meta application here, then authorize your own Facebook Pages or Instagram Professional profile through Meta. REACH requests only read-only access in this phase.</p>
  </div><span className="reach-social-state">{ready?"Read-only authorization ready":"Additional setup required"}</span></div>
  <div className="reach-social-status">
   <div><strong>Workspace records</strong><span>{storageApproved?"Approved":"Workspace setup required"}</span></div>
   <div><strong>Facebook Pages</strong><span>{meta.find(x=>x.provider==="facebook_pages")?.launchEnabled?"Ready for consent":"Developer setup required"}</span></div>
   <div><strong>Instagram Professional</strong><span>{meta.find(x=>x.provider==="instagram_professional")?.launchEnabled?"Ready for consent":"Developer setup required"}</span></div>
   <div><strong>Publishing & messaging</strong><span>Disabled</span></div>
  </div>
  <div className="reach-social-config">
   <strong>Meta OAuth callback URL</strong>
   <div><code>{callback||"Loading callback address…"}</code>
    <button type="button" disabled={!callback} onClick={()=>void copyCallback()}>{copied?"Copied":"Copy"}</button></div>
   <small>Add this exact HTTPS URL in your Facebook Login and Instagram Business Login OAuth redirect settings. Each Meta app has its own ID and secret.</small>
  </div>
  {message&&<p className="reach-social-success" role="status">{message}</p>}
  {error&&<p className="reach-social-error" role="alert">{error}</p>}
  <div className="reach-social-providers">
   {meta.map(item=>{
    const saved=apps.find(a=>a.provider===item.provider);
    const facebook=item.provider==="facebook_pages";
    return <div key={item.provider} id={"reach-meta-setup-"+item.provider}>
     <strong>{facebook?"Facebook Pages":"Instagram Professional"}</strong>
     <span>{item.launchEnabled?"Connect available":saved?.configured?"App saved · enable consent":"Not authorized"}</span>
     <p>Read-only permissions: {item.permissions.join(", ")||"Provider setup required"}</p>
     {!facebook&&item.duplicateAppId&&<p className="reach-social-error" role="alert">Instagram and Facebook are saved with the same developer App ID. The Instagram Login product needs its Instagram App ID and matching Instagram App Secret from Meta Developer Apps → Instagram → API setup with Instagram login. Replace only the Instagram credentials below. Facebook authorization is unaffected.</p>}
     {!item.launchEnabled&&<p className="reach-social-suggestion">{saved?.configured?"Developer app saved. Check the callback and provider readiness before authorizing.":"Start here: enter your developer App ID and Secret below, save encrypted, then select Connect on the provider card."}</p>}
     <p>{facebook?"Meta app → Facebook Login for Business → Settings":"Meta app → Instagram → API setup with Instagram login → Business login settings"}</p>
     {saved?.configured&&<p className="reach-social-saved">Saved app ID: {saved.clientIdMasked} · Secret encrypted</p>}
     {available&&storageApproved?<form className="reach-meta-app-form" onSubmit={e=>void saveApp(e,item.provider)} autoComplete="off">
      <label htmlFor={"meta-app-id-"+item.provider}>{facebook?"Meta Facebook App ID":"Instagram App ID"}</label>
      <input id={"meta-app-id-"+item.provider} inputMode="numeric" pattern="[0-9]{6,32}"
       placeholder="Numeric app ID" value={appId[item.provider]}
       disabled={working!==null} required autoComplete="off"
       onChange={e=>setAppId(old=>({...old,[item.provider]:e.target.value}))}/>
      <label htmlFor={"meta-app-secret-"+item.provider}>{facebook?"Meta App Secret":"Instagram App Secret"}</label>
      <input id={"meta-app-secret-"+item.provider} type="password" placeholder="Enter privately"
       value={appSecret[item.provider]} disabled={working!==null} required
       autoComplete="new-password" spellCheck={false}
       onChange={e=>setAppSecret(old=>({...old,[item.provider]:e.target.value}))}/>
      <button type="submit" disabled={working!==null}>{working===item.provider?"Encrypting…":saved?.configured?"Replace encrypted app credentials":"Save app credentials (encrypted)"}</button>
      <small>The secret is sent only to the authenticated REACH server, stored encrypted in your owner vault, and never displayed again. Saving an app does not connect an account.</small>
     </form>:<p>Secure app configuration requires your signed-in owner vault.</p>}
     {item.missingSettings.length>0&&<details><summary>Missing developer configuration ({item.missingSettings.length})</summary>
       <div>{item.missingSettings.map(s=><code key={s}>{s}</code>)}</div>
     </details>}
    </div>;
   })}
  </div>
  <p className="reach-social-hint">Connect actual Facebook Pages and Instagram Professional accounts using the provider cards below. Account owners must explicitly approve Meta's consent screen. Existing personal Instagram accounts require a Business or Creator account.</p>
  <a href={safeAppUrl} target="_blank" rel="noopener noreferrer">Open Meta Developer Apps</a>
 </section>;
}
