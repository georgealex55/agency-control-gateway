"use client";
import {useState} from "react";
import {PLATFORM_SERVICES,type PlatformServiceId} from "@/lib/platform-services";
const icons:Record<PlatformServiceId,string>={website:"⌂",learning:"▤",crm:"◫",social:"↗",automation:"⚡"};
export default function ServiceCatalog(){
  const [selected,setSelected]=useState<PlatformServiceId>("website");
  const active=PLATFORM_SERVICES.find(s=>s.id===selected)!;
  return <div className="ag-platform-section">
    <div className="ag-eyebrow">OPEN-SOURCE PLATFORM ENGINE</div>
    <h1>All the tools. One experience.</h1>
    <p className="ag-subhead">Each module retains its original source structure. The agency portal provides one control experience across independent services.</p>
    <div className="ag-modulegrid ag-modulecatalog">
      {PLATFORM_SERVICES.map(s=><button className={"ag-sourcecard "+(selected===s.id?"selected":"")} key={s.id} onClick={()=>setSelected(s.id)}>
        <span className="ag-source-icon">{icons[s.id]}</span><strong>{s.title}</strong><small>{s.summary}</small>
        <span className={"ag-source-status "+(s.status==="deferred"?"deferred":"")}>{s.status==="deferred"?"Future phase":"Source ready"}</span>
      </button>)}
    </div>
    <section className="ag-card">
      <div className="ag-platform-bar"><div><div className="ag-eyebrow">MODULE DETAILS</div><h2>{active.title}</h2><p>{active.summary}</p></div><span className="ag-readonly">NOT LIVE</span></div>
      <div className="ag-columns">
        <div><h3>Target functionality</h3><div className="ag-source-list">{active.capabilities.map((c,i)=><div key={c}><span>{String(i+1).padStart(2,"0")}</span>{c}</div>)}</div></div>
        <div><h3>Original source repositories</h3><div className="ag-source-list">{active.upstream.map(name=><div key={name}><span>↳</span>{name}</div>)}</div><div className="ag-ws-note"><b>Required runtime:</b> {active.runtime}<p>Original source is pinned in /services/sources. Functionality becomes available only after an isolated backend deploy, integration tests and tenant authorization.</p></div></div>
      </div>
    </section>
    <p className="ag-footnote">Source ready does not mean the service is running. GHL import and scans are deliberately excluded from this phase.</p>
  </div>;
}
