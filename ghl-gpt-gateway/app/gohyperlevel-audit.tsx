"use client";
import {useState} from "react";
import {GOHYPERLEVEL_REPO,GOHYPERLEVEL_SHA,GOHYPERLEVEL_AUDITED,GOHYPERLEVEL_AREAS,GOHYPERLEVEL_GATES,hyperlevelEvidence} from "@/lib/gohyperlevel-audit";
export default function GoHyperLevelAudit(){
 const [details,setDetails]=useState(false);
 return <section className="ag-card" aria-label="GoHyperLevel comparison audit">
  <div className="ag-platform-bar"><div>
   <div className="ag-eyebrow">VERSION-PINNED GITHUB SOURCE AUDIT · {GOHYPERLEVEL_AUDITED}</div>
   <h2>GoHyperLevel vs our five original engines</h2>
   <p>Real source implementations compared; no backend replacement or customer-data migration.</p>
  </div><span className="ag-readonly">EVALUATION ONLY</span></div>
  <div className="ag-ws-note">
   <b>Preliminary: GoHyperLevel may consolidate CRM, Builder, LMS and common automations.</b>
   <p>Its social planner still requires Postiz; its Node backend stores a SQLite database on a persistent disk. Functional quality and appearance are not verified yet.</p>
   <p><a href={"https://github.com/"+GOHYPERLEVEL_REPO+"/tree/"+GOHYPERLEVEL_SHA} target="_blank" rel="noreferrer">Open the exact reviewed upstream source</a> · AGPL-3.0 · no live engine connected</p>
  </div>
  <div style={{overflowX:"auto"}}>
   <table style={{width:"100%",minWidth:680,borderCollapse:"collapse",margin:"14px 0",fontSize:13}}>
    <thead><tr>{["Capability","Original stack","GoHyperLevel source and remaining tests"].map(s=><th key={s} style={{textAlign:"left",padding:10,borderBottom:"1px solid #dce4ee"}}>{s}</th>)}</tr></thead>
    <tbody>{GOHYPERLEVEL_AREAS.map(row=><tr key={row.id}>
     <td style={{padding:10,borderBottom:"1px solid #dce4ee",verticalAlign:"top"}}><b>{row.name}</b></td>
     <td style={{padding:10,borderBottom:"1px solid #dce4ee",verticalAlign:"top"}}>{row.original}</td>
     <td style={{padding:10,borderBottom:"1px solid #dce4ee",verticalAlign:"top"}}>
      <strong>{row.candidate}</strong><p>{row.finding}</p>
      <small>Needs testing: {row.unverified}</small>
      <p>{row.evidence.slice(0,2).map((path,i)=><a key={path} style={{marginRight:10}} href={hyperlevelEvidence(path)} target="_blank" rel="noreferrer">Evidence {i+1}</a>)}</p>
     </td>
    </tr>)}</tbody>
   </table>
  </div>
  <button type="button" className="ag-secondary" aria-expanded={details} onClick={()=>setDetails(old=>!old)}>
   {details?"Hide":"Show"} functional and visual audit gates
  </button>
  {details&&<ol style={{paddingLeft:24,lineHeight:1.8}}>{GOHYPERLEVEL_GATES.map(g=><li key={g}>{g}</li>)}</ol>}
  <p className="ag-footnote">Source coverage is not proof of running behavior. Decision: evaluate, not migrate. The current five-engine staging architecture is unchanged.</p>
 </section>;
}
