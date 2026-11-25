import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import Link from "next/link";
import {cookieName,validSession} from "@/lib/portal-auth";
import "@/app/connections/connections.css";
export const dynamic="force-dynamic";
const base="https://agency-control-gateway.vercel.app";
const settings="https://vercel.com/georgealex1925-2750s-projects/agency-control-gateway/settings/environment-variables";
const providers=[
 {id:"youtube",name:"YouTube",prefix:"SOCIAL_YOUTUBE_",console:"https://console.cloud.google.com/",instructions:"Enable YouTube Data API v3 and create a Web application OAuth client. Register the redirect URI below and add your test user if required.",keyLabel:"Google OAuth client ID"},
 {id:"tiktok",name:"TikTok",prefix:"SOCIAL_TIKTOK_",console:"https://developers.tiktok.com/",instructions:"Create a web app, configure Login Kit and register the redirect URI below. Start with user.info.basic; additional read-only scopes require approval.",keyLabel:"TikTok client key"}
] as const;
export default async function DeveloperVideoPage(){
 const jar=await cookies();
 if(!validSession(jar.get(cookieName())?.value))redirect("/login?next=%2Fdeveloper%2Fvideo");
 return <main className="reach-conn"><div className="reach-conn-wrap">
  <nav aria-label="Developer navigation"><Link href="/connections">← Connections</Link><Link href="/developer/meta">Developer integrations</Link></nav>
  <header><div className="reach-conn-eyebrow">REACH · OWNER SETUP</div><h1>YouTube and TikTok settings</h1>
  <p>Enter your developer credentials securely in Vercel. These are setup-only integrations; authorization, account storage and verification are not released yet.</p></header>
  <div className="reach-conn-grid">
   {providers.map(p=>{
    const uri=base+"/api/reach/connections/"+p.id+"/callback";
    const fields=[{key:p.prefix+"CLIENT_ID",label:p.keyLabel,ready:Boolean(process.env[p.prefix+"CLIENT_ID"])},{key:p.prefix+"CLIENT_SECRET",label:"Client secret (Sensitive)",ready:Boolean(process.env[p.prefix+"CLIENT_SECRET"])},{key:p.prefix+"REDIRECT_URI",label:"Redirect URI",ready:process.env[p.prefix+"REDIRECT_URI"]===uri}];
    return <article key={p.id} className="reach-conn-card reach-conn-card-red">
     <div className="reach-conn-card-head"><h2>{p.name}</h2><span className="reach-light reach-light-red"><i className="reach-light-dot red" aria-hidden="true"/>Not connected</span></div>
     <p>{p.instructions}</p>
     <p><a href={p.console} target="_blank" rel="noopener noreferrer">Open provider developer console</a></p>
     <p><strong>Planned redirect URI</strong></p><p><code style={{overflowWrap:"anywhere"}}>{uri}</code></p>
     <details className="reach-conn-details"><summary>Required environment settings</summary>
      <div className="reach-conn-detail-body">{fields.map(f=><div key={f.key}><p><strong>{f.label}</strong> — {f.ready?"Present in this deployment":"Not configured"}</p><code style={{overflowWrap:"anywhere"}}>{f.key}</code></div>)}
       <p>Use the Production environment. Mark the client secret Sensitive. Do not add enable flags until the full connector is released. Settings presence does not validate credentials.</p>
      </div>
     </details>
     <a className="reach-conn-button" href={settings} target="_blank" rel="noopener noreferrer">Enter secure settings in Vercel</a>
     <p className="reach-conn-small">After saving settings, a deployment is needed to update readiness. No sign-in, publishing or messaging is enabled here.</p>
    </article>;
   })}
  </div><p className="reach-conn-disclaimer">Existing Facebook and Instagram credentials and connections are unaffected. No credentials are displayed or collected by this page.</p>
 </div></main>;
}
