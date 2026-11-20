/**
 * Pure, fail-closed validation for customer-entered Neon Postgres credentials.
 * Never log this object or serialize its connectionString in a response.
 */
export type CustomerNeonDraft=Readonly<{connectionString:string;databaseName:string;hostname:string}>;
const NEON_ENDPOINT=/^ep-[a-z0-9-]+(?:-pooler)?\.(?:[a-z0-9-]+\.){2,5}neon\.tech$/;
const ALLOWED_PARAMS=new Set(["sslmode","channel_binding"]);
export function validateCustomerNeonUrl(value:unknown):CustomerNeonDraft{
 if(typeof value!=="string"||value.length<25||value.length>4096||/[\r\n\0]/.test(value))
  throw Error("Enter a complete Neon PostgreSQL connection string.");
 let url:URL;
 try{url=new URL(value);}catch{throw Error("The connection string is not a valid URL.");}
 if(url.protocol!=="postgres:"&&url.protocol!=="postgresql:")
  throw Error("Only PostgreSQL connection strings are supported.");
 if(!NEON_ENDPOINT.test(url.hostname)||url.hostname.length>253)
  throw Error("Use an official Neon database endpoint ending in neon.tech.");
 if(url.port&&url.port!=="5432")throw Error("Only Neon PostgreSQL port 5432 is supported.");
 if(!url.username||!url.password||url.username.length>128||url.password.length>1024||url.hash)
  throw Error("A database role and password are required.");
 let databaseName:string;
 try{databaseName=decodeURIComponent(url.pathname.substring(1));}
 catch{throw Error("The database name is invalid.");}
 if(!/^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(databaseName)||url.pathname.indexOf("/",1)!==-1)
  throw Error("Enter a valid database name.");
 if(url.searchParams.getAll("sslmode").length!==1||!["require","verify-full"].includes(url.searchParams.get("sslmode")||""))
  throw Error("Neon TLS is required (sslmode=require or verify-full).");
 if(url.searchParams.getAll("channel_binding").length>1)
  throw Error("Duplicate channel binding is not allowed.");
 for(const [key,val] of url.searchParams){
  if(!ALLOWED_PARAMS.has(key)||(key==="channel_binding"&&val!=="require"))
   throw Error("Remove unsupported connection options.");
 }
 return{connectionString:url.toString(),databaseName,hostname:url.hostname};
}
