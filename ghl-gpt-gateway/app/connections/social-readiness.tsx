"use client";
import {useEffect,useState,type FormEvent} from "react";
import "./social-readiness.css";

type Provider="facebook_pages"|"instagram_professional";
type Meta={
 provider:Provider;appConfigured:boolean;missingSettings:string[];permissions:string[];
 callbackUrl:string|null;launchEnabled:boolean;duplicateAppId:boolean;readOnly:true;publishingEnabled:false;
};
type AppStatus={provider:Provider;configured:boolean;clientIdMasked:string|null;updatedAt:string|null};
type AccountNames=Record<Provider,string[]>;
const safeAppUrl="https://developers.facebook.com/apps/";
const emptyNames:AccountNames={facebook_pages:[],instagram_professional:[]};

/** Each provider has its own setup, vault record, feedback and account status.
 * One callback endpoint is safe: server-signed OAuth state binds the provider,
 * workspace and one-time browser nonce, so Facebook and Instagram remain isolated.
 */
export default function SocialReadiness({meta,storageApproved,onConfigured,connectedAccounts=emptyNames}:{
 meta:Meta[];storageApproved:boolean;onConfigured:()=>void;connectedAccounts?:AccountNames;
}){
 const [copied,setCopied]=useState<Provider|null>(null);
 const [available,setAvailable]=useState(false);
 const [apps,setApps]=useState<AppStatus[]>([]);
 const [appId,setAppId]=useState<Record<Provider,string>>({facebook_pages:"",instagram_professional:""});
 const [appSecret,setAppSecret]=useState<Record<Provider,string>>({facebook_pages:"",instagram_professional:""});
 const [working,setWorking]=useState<Record<Provider,boolean>>({facebook_pages:false,instagram_professional:false});
 const [message,setMessage]=useState<Record<Provider,string>>({facebook_pages:"",instagram_professional:""});
 const [error,setError]=useState<Record<Provider,string>>({facebook_pages:"",instagram_professional:""});
 useEffect(()=>{
  let active=true;
  fetch("/api/reach/connections/meta-apps",{credentials:"same-origin",cache:"no-store"})
   .then(async r=>{if(!r.ok)throw Error("App configuration status is unavailable");return r.json() as Promise<{enabled:boolean;apps:AppStatus[]}>;})
   .then(r=>{if(active){setAvailable(r.enabled===true);setApps(Array.isArray(r.apps)?r.apps:[]);}})
   .catch(()=>{if(active)setAvailable(false);});
  return()=>{active=false;};
 },[]);
 async function copyCallback(provider:Provider){
  const canonicalCallback=meta.find(m=>m.provider===provider)?.callbackUrl;
  if(!canonicalCallback)return;
  try{await navigator.clipboard.writeText(canonicalCallback);setCopied(provider);}
  catch{setCopied(null);}
 }
 async function saveApp(e:FormEvent<HTMLFormElement>,provider:Provider){
  e.preventDefault();if(working[provider]||!available)return;
  const id=appId[provider].trim(),secret=appSecret[provider];
  if(!/^[0-9]{6,32}$/.test(id)||secret.length<8||secret.length>1024){
   setError(old=>({...old,[provider]:"Enter this provider's numeric application ID and complete application secret."}));
   return;
  }
  setWorking(old=>({...old,[provider]:true}));
  setError(old=>({...old,[provider]:""}));
  setMessage(old=>({...old,[provider]:""}));
  try{
   const response=await fetch("/api/reach/connections/meta-apps",{
    method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",
    referrerPolicy:"no-referrer",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({provider,clientId:id,clientSecret:secret})
   });
   if(!response.ok)throw Error("Could not save this provider's settings. Check the owner session and app vault.");
   const result=await response.json() as {app:AppStatus;credentialsEncrypted:boolean;accountConnected:false};
   if(result.credentialsEncrypted!==true||result.accountConnected!==false||result.app?.provider!==provider)
    throw Error("Provider app settings were not confirmed.");
   setApps(old=>[...old.filter(a=>a.provider!==provider),result.app]);
   setMessage(old=>({...old,[provider]:"Encrypted app credentials saved for this provider only. Account authorization still requires consent."}));
   setAppId(old=>({...old,[provider]:""}));
   onConfigured();
  }catch(cause){
   setError(old=>({...old,[provider]:cause instanceof Error?cause.message:"Provider setup failed."}));
  }finally{
   setAppSecret(old=>({...old,[provider]:""}));
   setWorking(old=>({...old,[provider]:false}));
  }
 }
 return <div className="reach-social-separate" aria-label="Independent Facebook and Instagram connection setup">
  {meta.map(item=>{
   const facebook=item.provider==="facebook_pages";
   const name=facebook?"Facebook Pages":"Instagram Professional";
   const saved=apps.find(a=>a.provider===item.provider);
   const accountNames=connectedAccounts[item.provider]||[];
   const invalidDirect=!facebook&&item.duplicateAppId;
   return <section key={item.provider} className="reach-social-readiness" id={"reach-meta-setup-"+item.provider}
    aria-labelledby={"reach-social-heading-"+item.provider}>
    <div className="reach-social-head"><div>
     <span className="reach-social-eyebrow">{facebook?"STEP 2A · FACEBOOK CONNECTION":"STEP 2B · INSTAGRAM CONNECTION"}</span>
     <h2 id={"reach-social-heading-"+item.provider}>{name} connection</h2>
     <p>{facebook?"Connect Facebook Pages independently through Facebook Login for Business. Existing Facebook permissions and Pages are not changed by editing Instagram credentials.":"Connect your Instagram Business or Creator profile independently. Instagram Login and Meta's newer Unified Login are different authorization methods."}</p>
    </div><span className="reach-social-state">{item.launchEnabled?"Read-only authorization ready":"Developer setup required"}</span></div>
    <div className="reach-social-status">
     <div><strong>Developer app</strong><span>{saved?.configured?"Saved · encrypted":"Not configured"}</span></div>
     <div><strong>Account connection</strong><span>{accountNames.length?accountNames.join(", "):"No account linked"}</span></div>
     <div><strong>Workspace storage</strong><span>{storageApproved?"Approved":"Setup required"}</span></div>
     <div><strong>Publishing & messaging</strong><span>Disabled</span></div>
    </div>
    <div className="reach-social-config">
     <strong>{name} OAuth callback URL</strong>
     <div><code>{item.callbackUrl||"Canonical OAuth callback not configured"}</code>
      <button type="button" disabled={!item.callbackUrl} onClick={()=>void copyCallback(item.provider)}>{copied===item.provider?"Copied":"Copy"}</button>
     </div>
     <small>Each provider uses the configured canonical /api/platform/social/meta/callback path; signed OAuth state keeps the provider and workspace independent. Copy this server-verified address (not a temporary Preview hostname) into its matching login product.</small>
    </div>
    {message[item.provider]&&<p className="reach-social-success" role="status">{message[item.provider]}</p>}
    {error[item.provider]&&<p className="reach-social-error" role="alert">{error[item.provider]}</p>}
    <div className="reach-social-providers"><div>
     <strong>{facebook?"Facebook developer credentials":"Instagram developer credentials"}</strong>
     <span>{item.launchEnabled?"Connect available":saved?.configured?"Saved · verify login method":"Not ready"}</span>
     <p>Read-only permissions: {item.permissions.join(", ")||"Provider setup required"}</p>
     {invalidDirect&&<p className="reach-social-error" role="alert">The saved Facebook and Instagram App IDs match. The current Instagram Direct Login endpoint cannot use a Facebook-only App ID. If Meta shows “API setup with Unified login” instead of “API setup with Instagram login”, keep your credentials: newer apps may require a different Unified Login implementation, which is not active in REACH yet. If your app provides a separate Instagram App ID and matching Instagram App Secret, enter them below. Facebook is unaffected.</p>}
     {!item.launchEnabled&&!invalidDirect&&<p className="reach-social-suggestion">{saved?.configured?"App saved. Check this provider's callback and authorization readiness before connecting.":"Start here: enter your developer App ID and Secret below, save encrypted, then select Connect on the provider card."}</p>}
     <p>{facebook?"Meta Developer Apps → Facebook Login for Business → Settings":"Meta Developer Apps → Instagram → API setup with Instagram login (older apps) or API setup with Unified login (newer apps)"}</p>
     {saved?.configured&&<p className="reach-social-saved">Saved app ID: {saved.clientIdMasked} · Secret encrypted · Stored separately</p>}
     {!facebook&&<details className="reach-social-method"><summary>Which Instagram login method do I have?</summary>
      <p><strong>Instagram Login:</strong> The dashboard gives you a separate Instagram App ID and matching Instagram App Secret. REACH supports this read-only authorization route.</p>
      <p><strong>Unified Login:</strong> Newer Meta apps may show only Unified Login with a Facebook Login for Business configuration ID. This is not the same authorization endpoint; it needs a separate implementation and is not yet active in REACH. Do not change the Facebook Page connection.</p>
     </details>}
     {available&&storageApproved?<form className="reach-meta-app-form" onSubmit={e=>void saveApp(e,item.provider)} autoComplete="off">
      <label htmlFor={"meta-app-id-"+item.provider}>{facebook?"Facebook App ID":"Instagram Login App ID"}</label>
      <input id={"meta-app-id-"+item.provider} inputMode="numeric" pattern="[0-9]{6,32}"
       placeholder={facebook?"Facebook Login App ID":"Instagram-specific App ID (if available)"} value={appId[item.provider]}
       disabled={working[item.provider]} required autoComplete="off"
       onChange={e=>setAppId(old=>({...old,[item.provider]:e.target.value}))}/>
      <label htmlFor={"meta-app-secret-"+item.provider}>{facebook?"Facebook App Secret":"Instagram Login App Secret"}</label>
      <input id={"meta-app-secret-"+item.provider} type="password" placeholder="Enter privately"
       value={appSecret[item.provider]} disabled={working[item.provider]} required
       autoComplete="new-password" spellCheck={false}
       onChange={e=>setAppSecret(old=>({...old,[item.provider]:e.target.value}))}/>
      <button type="submit" disabled={working[item.provider]}>{working[item.provider]?"Encrypting…":saved?.configured?"Replace this provider's credentials":"Save this provider's credentials (encrypted)"}</button>
      <small>This form changes only {name}. The secret is stored encrypted in the owner vault, never returned to the browser, and does not authorize an account automatically.</small>
     </form>:<p>Secure app configuration requires the signed-in owner vault and approved workspace.</p>}
     {item.missingSettings.length>0&&<details><summary>Missing developer configuration ({item.missingSettings.length})</summary>
      <div>{item.missingSettings.map(s=><code key={s}>{s}</code>)}</div>
     </details>}
    </div></div>
    <p className="reach-social-hint">{facebook?"Use the Facebook Pages card below to Connect, Verify or Disconnect only Facebook Pages.":"Use the Instagram card below to Connect, Verify or Disconnect only Instagram Professional accounts."} No social publishing or messaging is enabled.</p>
    <a href={"#reach-provider-"+(facebook?"facebook":"instagram")}>Go to {name} connection controls</a>
    <a href={safeAppUrl} target="_blank" rel="noopener noreferrer">Open Meta Developer Apps</a>
   </section>;
  })}
 </div>;
}
