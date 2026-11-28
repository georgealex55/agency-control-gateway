"use client";
import {useEffect,useRef,useState} from "react";
import GoogleOAuthPanel from "./google-oauth-panel";
import {INTEGRATIONS,GROUPS,type Integration} from "@/lib/reach-integration-catalog";
type Domain={id:string;hostname:string;ga4Configured:boolean;searchConfigured:boolean};
type Inventory={workspaceId:string;domains:Domain[];shopifyConfigured:boolean;pagespeedKeyConfigured:boolean;readOnly:true};
type Proof={provider:string;status:string;detail:string;account:string|null;scopes:string[];checkedAt:string;readOnly:true};
const settings="https://vercel.com/georgealex1925-2750s-projects/agency-control-gateway/settings/environment-variables";
async function call(url:string,init?:RequestInit){const r=await fetch(url,{credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(65000),...init});const v=await r.json();if(!r.ok)throw Error(v.error||"Setup status unavailable");return v;}
function External({url,children}:{url:string;children:React.ReactNode}){return <a className="reach-conn-button reach-provider-link" href={url} target="_blank" rel="noopener noreferrer">{children} ↗</a>}
function SetupCard({item,domain,inventory,proof,busy,onVerify}:{item:Integration;domain?:Domain;inventory:Inventory|null;proof?:Proof;busy:boolean;onVerify:()=>void}){
 const [fields,setFields]=useState<Record<string,string>>({});
 const [copied,setCopied]=useState("");
 const configured=item.id==="ga4"?domain?.ga4Configured:item.id==="search_console"?domain?.searchConfigured:item.id==="pagespeed"?inventory?.pagespeedKeyConfigured:item.id==="shopify"?inventory?.shopifyConfigured:false;
 const verified=proof?.status==="verified";
 const light=verified?"green":proof||configured||item.id==="pagespeed"?"yellow":"red";
 const label=verified?"Verified now":proof?.status==="attention"?"Check permissions":proof?.status==="unavailable"?"Check unavailable":configured?"Configured · verify":item.id==="pagespeed"?"Public API · verify":"Setup required";
 const property=fields["GA4 property ID"]||"";
 const mapping=item.id==="ga4"&&domain&&/^\d{1,20}$/.test(property)?JSON.stringify({[domain.hostname]:property}):item.id==="search_console"&&domain?JSON.stringify({[domain.hostname]:"https://"+domain.hostname+"/"}):null;
 const mapName=item.id==="ga4"?"REACH_WEB_ANALYTICS_PROPERTIES":"REACH_WEB_SEO_PROPERTIES";
 async function copy(s:string){try{await navigator.clipboard.writeText(s);setCopied("Copied");}catch{setCopied("Select and copy manually.");}}
 const shop=fields["Permanent myshopify.com domain"]?.trim().toLowerCase();
 const storeLink=shop&&/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(shop)?"https://"+shop+"/admin":null;
 return <article id={"reach-provider-"+item.id} className={"reach-conn-card reach-conn-card-"+light}>
 <div className="reach-conn-card-head"><h2>{item.name}</h2><span className={"reach-light reach-light-"+light}><i className={"reach-light-dot "+light}/>{label}</span></div><p>{item.purpose}</p>
 {proof&&<p role="status">{proof.detail}{proof.account?" · "+proof.account:""}<br/>Checked {new Date(proof.checkedAt).toLocaleString()}</p>}
 <div className="reach-provider-actions"><External url={item.setupUrl}>{configured?"Manage API setup":"Open connection setup"}</External>{item.mode==="verify"&&<button type="button" disabled={busy||!inventory||(!domain&&item.id!=="shopify")} onClick={onVerify}>{busy?"Checking…":"Verify connection"}</button>}</div>
 <details className="reach-conn-details"><summary>{verified?"Manage connection":"Setup fields & requirements"}</summary><div className="reach-conn-detail-body">
 <p>Required APIs: {item.apis.join(" · ")}</p>
 {item.fields.map(f=><div className="reach-setup-field" key={f.label}><label>{f.label}{f.secret?<span className="reach-conn-small"> · server-side secret</span>:null}{f.secret?<p>{f.env?"Enter securely as "+f.env+" in deployment settings.":"Prepare securely in the provider console; credential entry is not enabled."}</p>:f.kind==="host"?<input value={domain?.hostname||""} readOnly placeholder="Select a registered domain above"/>:<input type="text" autoComplete="off" maxLength={180} value={fields[f.label]||""} onChange={e=>{setFields(v=>({...v,[f.label]:e.target.value}));setCopied("");}} placeholder={f.placeholder||f.label}/>}</label>{f.env&&!f.secret&&<small>Deployment field: {f.env}</small>}</div>)}
 {mapping&&<div className="reach-conn-linked"><b>{mapName}</b><code className="reach-infra-break">{mapping}</code><button type="button" onClick={()=>void copy(mapping)}>Copy mapping</button><p className="reach-conn-small">Merge with any existing hostname mappings; do not overwrite other domains.</p></div>}
 {copied&&<p role="status">{copied}</p>}
 {item.steps.map((s,i)=><p key={i}>{i+1}. {s}</p>)}
 <div className="reach-provider-actions"><External url={storeLink||item.accountUrl}>Open provider account</External>{item.guide&&<External url={item.guide}>API instructions</External>}{item.mode==="verify"&&<External url={settings}>Protected deployment settings</External>}</div>
 {item.mode==="setup"&&<p className="reach-conn-small">Setup guide only. REACH authorization, token storage and data adapter for this provider have not been implemented. Do not paste secrets here.</p>}
 {proof?.scopes.length? <p className="reach-conn-small">Verified access: {proof.scopes.join(", ")}</p>:null}
 <p className="reach-conn-small">Input fields here are session-only setup aids, not saved credentials. Verification uses existing server-side configuration.</p>
 </div></details>
 </article>;
}
export default function ProviderSetupCards({workspaceId,refreshKey,attentionOnly}:{workspaceId:string;refreshKey:number;attentionOnly:boolean}){
 const [inventory,setInventory]=useState<Inventory|null>(null),[domainId,setDomainId]=useState(""),[proofs,setProofs]=useState<Record<string,Proof>>({}),[busy,setBusy]=useState(""),[error,setError]=useState("");
 const generation=useRef(0);
 useEffect(()=>{const run=++generation.current;setInventory(null);setProofs({});setBusy("");setError("");call("/api/reach/integrations?"+new URLSearchParams({workspaceId})).then(v=>{if(v.workspaceId!==workspaceId||v.readOnly!==true||!Array.isArray(v.domains))throw Error("Setup inventory unavailable");if(run===generation.current){setInventory(v);setDomainId(old=>v.domains.some((d:Domain)=>d.id===old)?old:v.domains[0]?.id||"");}}).catch(e=>{if(run===generation.current)setError(e.message);});return()=>{generation.current++;};},[workspaceId,refreshKey]);
 const domain=inventory?.domains.find(d=>d.id===domainId),key=(id:string)=>id+":"+(id==="shopify"?"store":domainId);
 async function verify(id:string){if(busy||!inventory)return;const run=generation.current,k=key(id);setBusy(id);setError("");setProofs(old=>{const next={...old};delete next[k];return next;});try{const v=await call("/api/reach/integrations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId,provider:id,domainId:id==="shopify"?null:domainId})});if(v.workspaceId!==workspaceId||v.readOnly!==true||v.domainId!==(id==="shopify"?null:domainId)||v.verification?.provider!==id||v.verification.readOnly!==true)throw Error("Verification response unavailable");if(run===generation.current)setProofs(old=>({...old,[k]:v.verification}));}catch(e){if(run===generation.current)setError(e instanceof Error?e.message:"Verification failed");}finally{if(run===generation.current)setBusy("");}}
 return <section className="reach-provider-groups" aria-label="Additional provider connections"><div className="reach-conn-workspace"><label htmlFor="provider-domain">Website for Google verification</label><select id="provider-domain" value={domainId} disabled={!!busy} onChange={e=>setDomainId(e.target.value)}>{!inventory?.domains.length&&<option value="">Register a domain first</option>}{inventory?.domains.map(d=><option key={d.id} value={d.id}>{d.hostname}</option>)}</select><a href="#domains">Manage domains</a></div>
 {error&&<p role="alert" className="reach-health-warning">{error}</p>}
 {GROUPS.map(group=><section key={group} className="reach-provider-group"><div className="reach-provider-heading"><h2>{group}</h2><small>{INTEGRATIONS.filter(i=>i.group===group).length} integrations</small></div>{group==="Google"&&<GoogleOAuthPanel workspaceId={workspaceId} domain={domain} refreshKey={refreshKey}/>}
 {group==="Google"&&<div className="reach-conn-alert"><h3>Google developer setup</h3><p>Reuse one project for compatible services. Use the unified OAuth panel above for supported groups, or the existing service-account configuration for Analytics and Search Console.</p><div className="reach-provider-actions"><External url="https://console.cloud.google.com/projectcreate">Create Cloud project</External><External url="https://console.cloud.google.com/apis/library">API library</External><External url="https://console.cloud.google.com/auth/overview">OAuth consent</External><External url="https://console.cloud.google.com/auth/clients">OAuth clients</External><External url="https://console.cloud.google.com/iam-admin/serviceaccounts">Service accounts</External></div></div>}
 <div className="reach-conn-grid">{INTEGRATIONS.filter(i=>i.group===group&&(!attentionOnly||proofs[key(i.id)]?.status!=="verified")).map(item=><SetupCard key={key(item.id)} item={item} domain={domain} inventory={inventory} proof={proofs[key(item.id)]} busy={!!busy} onVerify={()=>void verify(item.id)}/>)}</div></section>)}
 <details className="reach-conn-alert"><summary>Developer setup checklist · all new providers</summary><p>Setup pages and APIs only. No paid accounts, developer apps, consent grants or DNS changes are created automatically.</p>{INTEGRATIONS.map(i=><p key={i.id}><strong>{i.name}:</strong> {i.apis.join(", ")} — <a href={i.setupUrl} target="_blank" rel="noopener noreferrer">Setup ↗</a></p>)}</details></section>;
}
