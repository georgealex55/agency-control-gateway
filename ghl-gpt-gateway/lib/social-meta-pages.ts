/** Strict, GET-only Meta Page discovery. Never makes writes, follows untrusted paging URLs, or returns Page tokens. */
export type FacebookPageSummary={id:string;name:string;tasks:string[]};
export async function listFacebookPages(input:{token:string;version:string;fetcher?:typeof fetch}):Promise<FacebookPageSummary[]>{
 if(!/^v[0-9]{1,2}\.[0-9]{1,2}$/.test(input.version)||typeof input.token!=="string"||input.token.length<10||input.token.length>4096)throw Error("Invalid Meta read configuration");
 const url="https://graph.facebook.com/"+input.version+"/me/accounts?fields=id%2Cname%2Ctasks&limit=25";
 const fetcher=input.fetcher||fetch;
 const response=await fetcher(url,{method:"GET",headers:{Authorization:"Bearer "+input.token,Accept:"application/json"},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error("Meta Page discovery was denied");
 const result:unknown=await response.json();
 if(!result||typeof result!=="object"||Array.isArray(result))throw Error("Unexpected Meta response");
 const o=result as Record<string,unknown>;
 if(!Array.isArray(o.data)||o.data.length>25)throw Error("Meta Page discovery limit exceeded");
 const pages:FacebookPageSummary[]=[];
 for(const raw of o.data){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Invalid Page data");
  const p=raw as Record<string,unknown>;
  if(typeof p.id!=="string"||!/^[0-9]{2,40}$/.test(p.id)||typeof p.name!=="string"||p.name.length<1||p.name.length>150)throw Error("Invalid Page identity");
  const tasks=Array.isArray(p.tasks)?p.tasks.filter((v):v is string=>typeof v==="string"&&v.length<50).slice(0,20):[];
  pages.push({id:p.id,name:p.name,tasks});
 }
 return pages;
}
