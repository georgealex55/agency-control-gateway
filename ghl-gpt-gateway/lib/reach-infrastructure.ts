import {Resolver} from "node:dns/promises";
import {isIP} from "node:net";
export function normalizeDomain(value:unknown):string|null{
 if(typeof value!=="string")return null;
 const host=value.trim().toLowerCase().replace(/\.$/,"");
 if(host.length>253||isIP(host)||!host.includes(".")||!/[a-z]{2,63}$/.test(host.split(".").pop()||"")||/(^|\.)(localhost|local|internal|test|invalid|example|onion|home|lan|arpa)$/.test(host))return null;
 return host.split(".").every(l=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))?host:null;
}
export function safeCount(v:unknown):number|null{
 if(typeof v!=="number"&&!(typeof v==="string"&&/^\d+$/.test(v)))return null;
 const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:null;
}
export async function domainDns(host:string,id:string,resolver=new Resolver({timeout:1800,tries:1})){
 if(normalizeDomain(host)!==host||! /^[a-f0-9-]{36}$/i.test(id))throw Error("Invalid domain check");
 const lookup=async<T>(fn:()=>Promise<T>)=>{try{return {status:"returned",records:await fn()};}catch(e){const code=(e as {code?:string})?.code;return {status:code==="ENODATA"||code==="ENOTFOUND"?"not_found":"unavailable",records:null};}};
 const [a,aaaa,cname,mx,ns,txt]=await Promise.all([lookup(()=>resolver.resolve4(host)),lookup(()=>resolver.resolve6(host)),lookup(()=>resolver.resolveCname(host)),lookup(()=>resolver.resolveMx(host)),lookup(()=>resolver.resolveNs(host)),lookup(()=>resolver.resolveTxt("_reach-verification."+host))]);
 const ownership=txt.status==="returned"&&txt.records?.some(parts=>parts.join("")==="reach-verification="+id)?"verified":txt.status==="unavailable"?"unavailable":"not_verified";
 return {checkedAt:new Date().toISOString(),ownership,records:{a,aaaa,cname,mx,ns},ssl:"not_checked",readOnly:true};
}

type DnsState="returned"|"not_found"|"unavailable";
type Observation<T>={status:DnsState;records:T[]|null};
export async function domainIntelligence(host:string,id:string,resolver=new Resolver({timeout:2200,tries:1})){
 if(normalizeDomain(host)!==host)throw Error("Invalid hostname");
 const start=Date.now();
 const lookup=async<T>(fn:()=>Promise<T[]>):Promise<Observation<T>>=>{
  try{return {status:"returned",records:(await fn()).slice(0,64)};}
  catch(e){return {status:["ENODATA","ENOTFOUND"].includes((e as {code?:string})?.code||"")?"not_found":"unavailable",records:null};}
 };
 const [base,txt,dmarc,caa,soa,wwwA,wwwAAAA,wwwCname]=await Promise.all([
  domainDns(host,id,resolver),lookup(()=>resolver.resolveTxt(host)),lookup(()=>resolver.resolveTxt("_dmarc."+host)),lookup(()=>resolver.resolveCaa(host)),
  lookup(async()=>[await resolver.resolveSoa(host)]),
  host.startsWith("www.")?Promise.resolve({status:"unavailable" as const,records:null}):lookup(()=>resolver.resolve4("www."+host)),
  host.startsWith("www.")?Promise.resolve({status:"unavailable" as const,records:null}):lookup(()=>resolver.resolve6("www."+host)),
  host.startsWith("www.")?Promise.resolve({status:"unavailable" as const,records:null}):lookup(()=>resolver.resolveCname("www."+host))
 ]);
 // Only selected public TXT policy records, not unrelated verification values.
 const spf=(txt.records||[]).map(parts=>parts.join("")).filter(v=>/^v=spf1(?:\s|$)/i.test(v)).map(v=>v.slice(0,4096));
 const policies=(dmarc.records||[]).map(parts=>parts.join("")).filter(v=>/^v=DMARC1(?:\s*;|$)/i.test(v));
 const policy=policies.length===1?policies[0].match(/(?:^|;)\s*p\s*=\s*(none|quarantine|reject)\s*(?:;|$)/i)?.[1]?.toLowerCase()??null:null;
 const routing=[base.records.a,base.records.aaaa,base.records.cname];
 const has=(r:{status:string;records:unknown[]|null})=>r.status==="returned"&&!!r.records?.length;
 const unresolved=(r:{status:string}[])=>r.some(x=>x.status==="unavailable");
 const check=(name:string,status:"observed"|"attention"|"unknown",detail:string)=>({name,status,detail});
 const checks=[
  check("Ownership",base.ownership==="verified"?"observed":base.ownership==="unavailable"?"unknown":"attention",base.ownership==="verified"?"REACH TXT challenge matches.":base.ownership==="unavailable"?"Verification lookup unavailable.":"Verify control in Connections Center."),
  check("Website DNS",routing.some(has)?"observed":unresolved(routing)?"unknown":"attention",routing.some(has)?"Address or alias record returned; website uptime not tested.":"No confirmed address or alias record."),
  check("Mail routing",has(base.records.mx)?"observed":"unknown",has(base.records.mx)?"MX records returned; mail delivery not tested.":"No confirmed MX record; this hostname may not receive mail."),
  check("SPF",txt.status==="unavailable"?"unknown":spf.length===1?"observed":spf.length>1?"attention":"unknown",spf.length>1?"Multiple SPF records at this hostname; review with your mail provider.":spf.length===1?"One SPF record observed; sender authorization not evaluated.":"No SPF record observed here; check your sending domain."),
  check("DMARC",dmarc.status==="unavailable"?"unknown":policy==="reject"||policy==="quarantine"?"observed":policy==="none"||policies.length>1?"attention":"unknown",policy?"Published policy: "+policy+". Enforcement and alignment not tested.":policies.length>1?"Multiple DMARC records observed.":"No recognized policy here; organizational-domain inheritance not evaluated."),
  check("Nameservers",has(base.records.ns)?"observed":"unknown",has(base.records.ns)?"NS records returned.":"No NS answer here; subdomains often inherit parent-zone authority.")
 ];
 return {...base,hostname:host,elapsedMs:Date.now()-start,checks,mail:{spf,status:txt.status,dmarc:{count:policies.length,policy,status:dmarc.status},dkim:"not_checked"},authority:{caa,soa},www:{hostname:host.startsWith("www.")?null:"www."+host,a:wwwA,aaaa:wwwAAAA,cname:wwwCname},limits:{ssl:"not_checked",traffic:"not_connected",dnssec:"not_checked",registry:"not_checked"}};
}
