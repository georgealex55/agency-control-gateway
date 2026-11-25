"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import SocialReadiness from "@/app/connections/social-readiness";
import NeonCustomerCard from "@/app/connections/neon-customer-card";
import "@/app/connections/connections.css";
type Provider="facebook_pages"|"instagram_professional";
type Meta={provider:Provider;appConfigured:boolean;missingSettings:string[];permissions:string[];callbackUrl:string|null;launchEnabled:boolean;duplicateAppId:boolean;readOnly:true;publishingEnabled:false;loginMethod:"unified"|"direct";unifiedConfigured:boolean;unifiedRequested:boolean};
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
   <h1>Developer integrations.</h1>
   <p>Manage server-side Meta app credentials and infrastructure-only Neon configuration. These credentials and callback diagnostics are kept out of customer Connections.</p>
  </header>
  <section className="reach-conn-overview"><div><strong>Developer access</strong><span>Owner-only session</span></div>
   <div><strong>Customer developer credentials</strong><span>Not required</span></div>
   <div><strong>External publishing</strong><span>Disabled</span></div>
  </section>
  {error&&<p role="alert" className="reach-conn-error">{error}</p>}
  {!status&&!error&&<p role="status">Checking platform developer setup…</p>}
  <section aria-label="Neon infrastructure administration" className="reach-conn-alert"><h2>Infrastructure storage</h2><p>Owner-only database verification. This does not change the active REACH database or customer workspace data automatically.</p></section>
  <NeonCustomerCard/>
  {status&&<SocialReadiness meta={status.meta} storageApproved={status.storageApproved} onConfigured={()=>setVersion(x=>x+1)}/>}
  <section className="reach-conn-alert">
   <h2>Instagram Unified Login activation</h2>
   <p>Meta Developer Apps → Use cases → Manage messaging &amp; content on Instagram → Customize → API setup with Unified login → Create configuration. Save this REACH callback URL in Meta: <code>https://agency-control-gateway.vercel.app/api/platform/social/meta/callback</code>.</p>
   <p>In Vercel's private project settings, configure <code>SOCIAL_META_INSTAGRAM_UNIFIED_ENABLED=true</code> and <code>SOCIAL_META_INSTAGRAM_UNIFIED_CONFIG_ID</code> with the numeric Meta configuration ID. Use the existing matching Meta App ID/Secret in the encrypted owner vault. The config ID is not an access token. Redeploy after configuration; REACH keeps Instagram unavailable until both settings are valid.</p>
   <p>Meta controls the configuration's permissions, including its mandatory Instagram permissions. Review these carefully; REACH publishing and messaging remain disabled. Do not change the existing Facebook Page app or disconnect its authorization.</p>
   <a href="https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started" target="_blank" rel="noopener noreferrer">Meta Unified Login setup guide</a>
  </section>
  <section className="reach-conn-alert">
   <h2>Meta approval checklist</h2>
   <p>For customers beyond your app's test roles, configure the business-owned Meta application, approved OAuth redirect URLs, relevant permission reviews and Live mode in Meta Developer Apps. Instagram Unified Login requires a separate configuration and callback handler before it can be enabled. Threads requires its own verified OAuth integration.</p>
   <p>Normal business owners only click Connect, consent, select their account and verify in REACH.</p>
  </section>
 </div></main>;
}
