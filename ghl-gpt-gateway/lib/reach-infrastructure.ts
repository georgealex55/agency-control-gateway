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
