import {validGraphVersion} from "@/lib/social-meta-contract";
export type MetaReadRequest={token:string;version:string;provider:"facebook_pages"|"instagram_professional";fetcher?:typeof fetch};
export type MetaReadAccount={id:string;name:string;provider:string};
/* Fixed hosts + fixed read-only routes; never accept caller-supplied URLs, methods or file locations. */
export async function readMetaIdentity(input:MetaReadRequest):Promise<MetaReadAccount>{
 if(!validGraphVersion(input.version)||!input.token||input.token.length>4096)throw Error("Invalid Meta read configuration");
 const fb=input.provider==="facebook_pages";
 const url=fb?"https://graph.facebook.com/"+input.version+"/me?fields=id%2Cname":"https://graph.instagram.com/"+input.version+"/me?fields=user_id%2Cusername";
 const response=await (input.fetcher||fetch)(url,{method:"GET",headers:{"Authorization":"Bearer "+input.token,"Accept":"application/json"},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error("Meta identity read was rejected");
 const json:unknown=await response.json();
 const v=json&&typeof json==="object"&&!Array.isArray(json)?json as Record<string,unknown>:null;
 const id=fb?v?.id:v?.user_id;
 const name=fb?v?.name:v?.username;
 if(typeof id!=="string"||!/^[0-9]{2,40}$/.test(id)||typeof name!=="string"||name.length>150)throw Error("Invalid Meta identity response");
 return {id,name,provider:input.provider};
}
