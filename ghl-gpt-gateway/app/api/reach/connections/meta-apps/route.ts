import {NextRequest,NextResponse} from "next/server";
import {adminAuthenticated,sameOrigin} from "@/lib/portal-auth";
import {META_PROVIDERS,isMetaProvider} from "@/lib/social-meta-contract";
import {metaAppVaultReady,ownerMetaAppSetup,saveOwnerMetaApp,removeOwnerMetaApp} from "@/lib/reach-meta-app-vault";
export const runtime="nodejs";export const dynamic="force-dynamic";
const h={"Cache-Control":"private, no-store, max-age=0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:h});
async function payload(req:NextRequest):Promise<Record<string,unknown>|null>{
 if(Number(req.headers.get("content-length")||0)>1600)return null;
 let raw:string;try{raw=await req.text();}catch{return null;}
 if(raw.length>1600)return null;
 try{const v:unknown=JSON.parse(raw);return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;}
 catch{return null;}
}
export async function GET(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Owner sign-in required"},401);
 if(!metaAppVaultReady())return reply({enabled:false,apps:[]});
 try{return reply({enabled:true,apps:await Promise.all(META_PROVIDERS.map(ownerMetaAppSetup)),
  tokensSaved:false,publishingEnabled:false});}
 catch{return reply({error:"Meta developer app inventory unavailable"},503);}
}
export async function POST(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Owner sign-in required"},401);
 if(!sameOrigin(req))return reply({error:"Invalid request origin"},403);
 if(!metaAppVaultReady())return reply({error:"Meta app vault not activated"},423);
 const p=await payload(req);
 if(!p||Object.keys(p).some(k=>!["provider","clientId","clientSecret"].includes(k))||
    !isMetaProvider(p.provider)||typeof p.clientId!=="string"||typeof p.clientSecret!=="string"||
    !/^[0-9]{6,32}$/.test(p.clientId)||p.clientSecret.length<8||p.clientSecret.length>1024)
  return reply({error:"Provide a valid provider, app ID and secret"},400);
 try{
  const result=await saveOwnerMetaApp(p.provider,p.clientId,p.clientSecret);
  return reply({app:result,credentialsEncrypted:true,accountConnected:false,publishingEnabled:false},201);
 }catch{return reply({error:"Could not securely save Meta application credentials"},503);}
}
export async function DELETE(req:NextRequest){
 if(!adminAuthenticated(req))return reply({error:"Owner sign-in required"},401);
 if(!sameOrigin(req))return reply({error:"Invalid request origin"},403);
 if(!metaAppVaultReady())return reply({error:"Meta app vault not activated"},423);
 const p=await payload(req);
 if(!p||Object.keys(p).length!==1||!isMetaProvider(p.provider))
  return reply({error:"Valid provider required"},400);
 try{return reply({removed:await removeOwnerMetaApp(p.provider),provider:p.provider,
   providerAccessRevoked:false,accountConnected:false});}
 catch{return reply({error:"Unable to remove Meta app settings"},503);}
}
