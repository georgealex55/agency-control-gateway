// Read-only live staging check. Never uses a non-GET method.
const url=process.env.SOCIAL_POSTIZ_BASE_URL;
const key=process.env.SOCIAL_POSTIZ_API_KEY;
const org=process.env.SOCIAL_POSTIZ_ORG_ID;
if(!url||!key||!org){console.error("Missing staging Postiz URL, API key or organization ID");process.exit(2);}
const base=new URL(url);
if(base.protocol!=="https:"||base.pathname!=="/"||base.username||base.password||base.search||base.hash){console.error("Expected an HTTPS origin with no path or credentials");process.exit(2);}
async function get(path){
 const response=await fetch(base.origin+"/api/public/v1"+path,{method:"GET",headers:{Authorization:key,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error("Staging Postiz GET failed ("+response.status+")");
 return response.json();
}
try{
 const identity=await get("/me");
 if(identity?.organization?.id!==org)throw Error("Wrong organization; refusing to read channels");
 const channels=await get("/integrations");
 if(!Array.isArray(channels))throw Error("Postiz did not return a channel list");
 console.log(JSON.stringify({organizationVerified:true,readOnly:true,channels:channels.length,publishingAttempted:false}));
}catch(e){console.error(e instanceof Error?e.message:"Staging Postiz check failed");process.exitCode=1;}
