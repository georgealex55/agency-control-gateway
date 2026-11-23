"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import SocialReadiness from "@/app/connections/social-readiness";
import "@/app/connections/connections.css";
type Provider="facebook_pages"|"instagram_professional";
type Meta={provider:Provider;appConfigured:boolean;missingSettings:string[];permissions:string[];callbackUrl:string|null;launchEnabled:boolean;duplicateAppId:boolean;readOnly:true;publishingEnabled:false};
type Status={authenticated:true;storageApproved:boolean;meta:Meta[];developerOnly:true;publishingEnabled:false};
export default function DeveloperMetaConsole(){
 const [status,setStatus]=useState<Status|null>(null);
 const [error,setError]=useState("");
 const [version,setVersion]=useState(0);
 useEffect(()=>{
  let active=true;
  fetch("/api/reach/developer/meta-status",{credentials:"same-origin",cache:"no-store"})
   .then(async response=>{if(!response.ok)throw Error("Platform developer settings are unavailable");return response.json() as Promise<Status>;})
   .then(value=>{if(active&&value.developerOnly===true&&Array.isArray(value.meta))setStatus(value);})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:"Developer settings unavailable");});
  return()=>{active=false;};
 },[version]);
 return <main className="reach-conn"><div className="reach-conn-wrap">
  <nav aria-label="Developer navigation"><Link href="/connections">← Customer Connections</Link><Link href="/">REACH home</Link></nav>
  <header><div className="reach-conn-eyebrow">REACH PLATFORM · DEVELOPER ADMINISTRATION</div>
   <h1>Meta platform setup.</h1>
   <p>Configure the REACH-managed Meta applications once for customer authorization. Developer credentials and callback diagnostics belong here—not in customer Connections.</p>
  </header>
  <section className="reach-conn-overview"><div><strong>Developer access</strong><span>Owner-only session</span></div>
   <div><strong>Customer developer credentials</strong><span>Not required</span></div>
   <div><strong>External publishing</strong><span>Disabled</span></div>
  </section>
  {error&&<p role="alert" className="reach-conn-error">{error}</p>}
  {!status&&!error&&<p role="status">Checking platform developer setup…</p>}
  {status&&<SocialReadiness meta={status.meta} storageApproved={status.storageApproved} onConfigured={()=>setVersion(x=>x+1)}/>}
  <section className="reach-conn-alert">
   <h2>Meta approval checklist</h2>
   <p>For customers beyond your app's test roles, configure the business-owned Meta application, approved OAuth redirect URLs, relevant permission reviews and Live mode in Meta Developer Apps. Instagram Unified Login requires a separate configuration and callback handler before it can be enabled. Threads requires its own verified OAuth integration.</p>
   <p>Normal business owners only click Connect, consent, select their account and verify in REACH.</p>
  </section>
 </div></main>;
}
