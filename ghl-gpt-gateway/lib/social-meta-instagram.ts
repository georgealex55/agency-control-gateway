const validGraphVersion=(v:unknown):v is string=>typeof v==="string"&&/^v[0-9]{1,2}\.[0-9]{1,2}$/.test(v);
/**
 * Read-only Instagram Professional profile contract (Instagram Login API).
 * No OAuth initiation, tokens persisted, posting, comments, or message routes.
 */
export type InstagramProfessionalProfile={
 id:string;username:string;accountType:"BUSINESS"|"CREATOR"|"UNKNOWN";mediaCount:number|null;
};
export async function readInstagramProfessionalProfile(input:{token:string;version:string;fetcher?:typeof fetch}):Promise<InstagramProfessionalProfile>{
 if(!validGraphVersion(input.version)||typeof input.token!=="string"||input.token.length<10||input.token.length>4096)throw Error("Invalid Instagram API configuration");
 const url="https://graph.instagram.com/"+input.version+"/me?fields=id%2Cuser_id%2Cusername%2Caccount_type%2Cmedia_count";
 const response=await (input.fetcher||fetch)(url,{method:"GET",headers:{Authorization:"Bearer "+input.token,Accept:"application/json"},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error("Instagram profile read was rejected");
 const raw:unknown=await response.json();
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Invalid Instagram profile response");
 const p=raw as Record<string,unknown>,id=typeof p.user_id==="string"?p.user_id:p.id;
 if(typeof id!=="string"||!/^[0-9]{2,40}$/.test(id)||typeof p.username!=="string"||!/^[A-Za-z0-9._]{1,30}$/.test(p.username))throw Error("Invalid Instagram professional identity");
 const kind=p.account_type==="BUSINESS"?"BUSINESS":p.account_type==="CREATOR"?"CREATOR":"UNKNOWN";
 const count=typeof p.media_count==="number"&&Number.isSafeInteger(p.media_count)&&p.media_count>=0?p.media_count:null;
 return {id,username:p.username,accountType:kind,mediaCount:count};
}
