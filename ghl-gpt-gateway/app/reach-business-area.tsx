"use client";
import {useState} from "react";
import DomainIntelligencePanel from "./domain-intelligence-panel";
import WebsiteAnalyticsPanel from "./website-analytics-panel";
import WebsiteSeoPanel from "./website-seo-panel";
import {REACH_FEATURES,featureLabel} from "./reach-ui-23";
import {PLATFORM_SERVICES} from "@/lib/platform-services";
export default function ReachBusinessArea({area,initialTool}:{area:"web"|"marketing";initialTool:string}){
 const web=area==="web",group=web?"Web Design":"Marketing";
 const items=REACH_FEATURES.filter(f=>f.group===group&&!f.id.endsWith("-home"));
 const [tool,setTool]=useState(initialTool==="web-publishing"?"website":initialTool);
 const selected=items.find(f=>f.id===tool);
 const engine=PLATFORM_SERVICES.find(s=>s.id==="website");
 return <section className="reach-directory" aria-label={group}>
  <div className="reach-intro"><div><div className="ag-eyebrow">REACH / {group.toUpperCase()}</div><h1>{web?"Web Design":"Marketing"}</h1><p>{web?"Build, connect, maintain and measure your business website.":"Promote your business, capture leads and measure campaign results."}</p></div></div>
  <div className="reach-feature-grid">{items.map(f=><article className="reach-feature" key={f.id}><span className="reach-feature-icon" aria-hidden="true">{f.icon}</span><div><div className="reach-feature-title"><h3>{f.title}</h3><span className={"reach-status "+f.status}>{featureLabel(f)}</span></div><p>{f.description}</p><small>{f.detail}</small></div><button className="reach-open" type="button" aria-pressed={tool===f.id} onClick={()=>setTool(v=>v===f.id?"":f.id)}>{tool===f.id?"Collapse":"Details"}</button></article>)}</div>
  {selected?.id==="web-domains"&&<DomainIntelligencePanel/>}
  {selected?.id==="web-analytics"&&<WebsiteAnalyticsPanel/>}
  {selected?.id==="web-seo"&&<WebsiteSeoPanel/>}
  {selected&&selected.id!=="web-domains"&&selected.id!=="web-analytics"&&selected.id!=="web-seo"&&<section className="ag-card" aria-label={selected.title}><h2>{selected.title}</h2><p>{selected.description}</p><p className="ag-ws-note">{selected.detail}</p>
   {selected.id==="website"&&engine&&<><h3>Website engine foundation</h3><div className="ag-source-list">{engine.capabilities.filter(c=>c!=="Forms & appointments").map(c=><div key={c}>{c}</div>)}</div><p>Runtime: {engine.runtime}. The visual editor is not live yet.</p></>}
   {selected.id==="website"&&<details className="ag-card" open={initialTool==="web-publishing"}><summary>Hosting &amp; Publishing</summary><p>Website previews, deployment and hosting configuration belong to Website Builder. The visual editor and managed website publishing runtime are not enabled yet. Existing external hosting stays unchanged.</p><div className="ag-social-actions"><a className="ag-secondary" href="/connections#domains">Manage domain connections</a><a className="ag-secondary" href="/?view=web&tool=web-domains">Inspect existing DNS routing</a></div><p>No hosting transfer, DNS edits or deployment actions are available here.</p></details>}
   {selected.id==="funnels"&&<><h3>Lead generation tools</h3><div className="ag-source-list">{["Landing pages","Lead capture forms","Funnel steps","Conversion tracking"].map(c=><div key={c}>{c}</div>)}</div><p>Website engine groundwork is available; public intake and conversion tracking are not enabled.</p></>}
   {selected.id==="social-ads"&&<p>Paid campaigns require a separate advertising account connection and budget approval. Organic post analytics do not provide ad spend or attribution.</p>}
  </section>}
  {web&&<section className="ag-card"><h2>Website infrastructure</h2><p>Manage domain ownership and check your database health in one place.</p><div className="ag-social-actions"><a className="ag-secondary" href="/?view=web&tool=web-domains">Domains &amp; DNS</a><a className="ag-secondary" href="/connections#neon">Neon database</a></div></section>}
  <p className="ag-footnote">Planned features are shown for navigation and readiness only. No connection, campaign, website or external action is created here.</p>
 </section>;
}
