/**
 * Runs the built Next.js server with freshly generated fictional owner secrets.
 * Never reads production Vercel credentials or sends a request outside localhost.
 * Requires npm run build in ghl-gpt-gateway before execution.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash,randomBytes} from "node:crypto";
import {createServer} from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../ghl-gpt-gateway");
const password="Synthetic-Owner-"+randomBytes(22).toString("base64url");
const passwordHash=createHash("sha256").update(password,"utf8").digest("hex");
const sessionSecret=randomBytes(48).toString("base64url");
const port=await new Promise((accept,reject)=>{
 const server=createServer();
 server.once("error",reject);
 server.listen(0,"127.0.0.1",()=>{const address=server.address();const port=address.port;server.close(()=>accept(port));});
});
const origin="http://localhost:"+port;
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",String(port),"-H","localhost"],{
 cwd:root,env:{...process.env,AGENCY_PORTAL_PASSWORD_SHA256:passwordHash,AGENCY_PORTAL_SESSION_SECRET:sessionSecret},
 stdio:["ignore","pipe","pipe"]
});
let diagnostics="";
for(const stream of [server.stdout,server.stderr])stream.on("data",data=>{diagnostics=(diagnostics+data.toString()).slice(-3000);});
const json=async response=>response.json();
const session=async cookie=>json(await fetch(origin+"/api/portal/session",{
 headers:cookie?{Cookie:cookie}:{},cache:"no-store",redirect:"manual"
}));
const post=async(password,headers={})=>fetch(origin+"/api/portal/session",{
 method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify({password}),redirect:"manual"
});
const logout=async headers=>fetch(origin+"/api/portal/session",{method:"DELETE",headers,redirect:"manual"});
try{
 let initialized=false;
 for(let attempts=0;attempts<100;attempts++){
  if(server.exitCode!==null)throw Error("Next.js server exited: "+diagnostics);
  try{
   const r=await fetch(origin+"/api/portal/session");
   if(r.ok){initialized=true;break;}
  }catch{}
  await delay(200);
 }
 assert.equal(initialized,true,"Built Next.js owner login must start: "+diagnostics);
 const first=await session();
 assert.deepEqual(first,{configured:true,authenticated:false,setupIssue:null},"unverified request must be signed out");
 const missingOrigin=await post(password);
 assert.equal(missingOrigin.status,403,"POST without same-origin header must be refused");
 const wrongOrigin=await post(password,{Origin:"https://untrusted.example"});
 assert.equal(wrongOrigin.status,403,"cross-site sign-in must be refused");
 const invalid=await post("fictional-invalid-owner-password",{Origin:origin});
 assert.equal(invalid.status,401,"incorrect login must fail");
 const success=await post(password,{Origin:origin});
 assert.equal(success.status,200,"fictional owner password must be accepted");
 assert.equal((await success.json()).authenticated,true);
 const setCookie=success.headers.get("set-cookie")||"";
 assert.match(setCookie,/agency_portal_session=/,"owner cookie must be set");
 assert.match(setCookie,/httponly/i,"owner cookie must be HttpOnly");
 assert.match(setCookie,/samesite=strict/i,"owner cookie must be SameSite=Strict");
 assert.match(setCookie,/secure/i,"production-mode cookie must use Secure");
 const cookie=setCookie.split(";")[0];
 assert.equal((await session(cookie)).authenticated,true,"valid signed cookie must authenticate");
 const [key,value]=cookie.split("=");
 const mutated=value.slice(0,-2)+"AA";
 assert.equal((await session(key+"="+mutated)).authenticated,false,"tampered signed cookie must fail");

 // Preview Neon customer onboarding: negative-path real HTTP coverage only.
 // None of these cases makes a database connection or passes a real password.
 const verifyUrl=origin+"/api/reach/connections/neon/verify";
 const syntheticDsn="postgresql://fictional:synthetic@ep-simulated.c-2.us-east-2.aws.neon.tech/synthetic_db?sslmode=require";
 const verify=async(payload,headers={})=>fetch(verifyUrl,{
  method:"POST",headers:{"Content-Type":"application/json",Origin:origin,Cookie:cookie,...headers},
  body:JSON.stringify(payload),redirect:"manual"
 });
 const noAuth=await verify({connectionString:syntheticDsn},{Cookie:""});
 assert.equal(noAuth.status,401,"Neon verification must require owner session");
 const crossOrigin=await verify({connectionString:syntheticDsn},{Origin:"https://malicious.example"});
 assert.equal(crossOrigin.status,403,"Neon verification must refuse cross-origin requests");
 const malformed=await verify({connectionString:"not-a-postgres-url"});
 assert.equal(malformed.status,422,"Invalid DSN rejected before any remote request");
 const unsafeHost=await verify({connectionString:"postgresql://u:p@127.0.0.1/synthetic_db?sslmode=require"});
 assert.equal(unsafeHost.status,422,"Private IP must be rejected before network");
 const missingTls=await verify({connectionString:syntheticDsn.replace("?sslmode=require","")});
 assert.equal(missingTls.status,422,"TLS must be enforced before network");
 const excessFields=await verify({connectionString:syntheticDsn,store:true});
 assert.equal(excessFields.status,400,"No persistence or extra fields accepted");
 const getVerify=await fetch(verifyUrl,{redirect:"manual"});
 assert.equal(getVerify.status,405,"Verification route must reject GET requests");
 const badPayload=await fetch(verifyUrl,{method:"POST",
  headers:{"Content-Type":"application/json",Origin:origin,Cookie:cookie},
  body:"{broken json",redirect:"manual"});
 assert.equal(badPayload.status,400,"Malformed JSON denied without contacting Neon");
 assert.match(badPayload.headers.get("cache-control")||"",/no-store/,"verification responses must never be cached");

 // Live Neon session HTTP safeguards: no real Neon access or customer credentials.
 const liveUrl=origin+"/api/reach/connections/neon/live";
 const liveNoAuth=await fetch(liveUrl,{redirect:"manual"});
 assert.equal(liveNoAuth.status,401,"Live status requires owner authentication");
 const liveNotConnected=await fetch(liveUrl,{headers:{Cookie:cookie},redirect:"manual"});
 assert.equal(liveNotConnected.status,200,"Authenticated live status should be readable");
 assert.equal((await liveNotConnected.json()).connected,false,"No live session exists until owner explicitly connects");
 const liveNoAuthPost=await fetch(liveUrl,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},
  body:JSON.stringify({connectionString:"invalid"}),redirect:"manual"});
 assert.equal(liveNoAuthPost.status,401,"Live connect requires owner session");
 const liveCross=await fetch(liveUrl,{method:"POST",
  headers:{Origin:"https://untrusted.example",Cookie:cookie,"Content-Type":"application/json"},
  body:JSON.stringify({connectionString:"invalid"}),redirect:"manual"});
 assert.equal(liveCross.status,403,"Live connect rejects foreign origin");
 const liveInvalid=await fetch(liveUrl,{method:"POST",
  headers:{Origin:origin,Cookie:cookie,"Content-Type":"application/json"},
  body:JSON.stringify({connectionString:"invalid"}),redirect:"manual"});
 assert.equal(liveInvalid.status,422,"Malformed connection rejected before any network access");
 const liveCrossDelete=await fetch(liveUrl,{method:"DELETE",headers:{Origin:"https://untrusted.example",Cookie:cookie},redirect:"manual"});
 assert.equal(liveCrossDelete.status,403,"Disconnect rejects foreign origins");
 const liveDisconnect=await fetch(liveUrl,{method:"DELETE",headers:{Origin:origin,Cookie:cookie},redirect:"manual"});
 assert.equal(liveDisconnect.status,200,"Signed-in owner can disconnect temporary link");
 assert.match(liveDisconnect.headers.get("set-cookie")||"",/max-age=0/i,"Disconnect clears ephemeral credential cookie");

 // Persistent owner-vault HTTP gate checks: no database env or external network.
 const savedUrl=origin+"/api/reach/connections/neon/saved";
 const savedNoAuth=await fetch(savedUrl,{redirect:"manual"});
 assert.equal(savedNoAuth.status,401,"Saved Neon inventory requires owner login");
 const savedWithoutVault=await fetch(savedUrl,{headers:{Cookie:cookie},redirect:"manual"});
 assert.equal(savedWithoutVault.status,200,"Saved Neon registry can report setup status without connecting");
 assert.deepEqual(await savedWithoutVault.json(),{configured:false,saved:false,storageActivated:false,readOnly:true});
 const saveAnonymous=await fetch(savedUrl,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},
  body:JSON.stringify({useLiveSession:true}),redirect:"manual"});
 assert.equal(saveAnonymous.status,401,"Saving credentials requires REACH owner login");
 const saveForeignOrigin=await fetch(savedUrl,{method:"POST",
  headers:{Origin:"https://untrusted.example",Cookie:cookie,"Content-Type":"application/json"},
  body:JSON.stringify({useLiveSession:true}),redirect:"manual"});
 assert.equal(saveForeignOrigin.status,403,"Saving must reject cross-origin requests");
 const saveWithoutVault=await fetch(savedUrl,{method:"POST",
  headers:{Origin:origin,Cookie:cookie,"Content-Type":"application/json"},
  body:JSON.stringify({useLiveSession:true}),redirect:"manual"});
 assert.equal(saveWithoutVault.status,503,"Saving stays disabled until dedicated vault and key exist");
 const deleteForeignOrigin=await fetch(savedUrl,{method:"DELETE",
  headers:{Origin:"https://untrusted.example",Cookie:cookie},redirect:"manual"});
 assert.equal(deleteForeignOrigin.status,403,"Saved credential deletion requires same origin");
 const deleteWithoutVault=await fetch(savedUrl,{method:"DELETE",
  headers:{Origin:origin,Cookie:cookie},redirect:"manual"});
 assert.equal(deleteWithoutVault.status,503,"Cannot delete an unconfigured vault");

 const deniedLogout=await logout({Origin:"https://untrusted.example",Cookie:cookie});
 assert.equal(deniedLogout.status,403,"cross-site logout must be refused");
 const signedOut=await logout({Origin:origin,Cookie:cookie});
 assert.equal(signedOut.status,200,"same-origin owner logout must succeed");
 assert.equal((await signedOut.json()).authenticated,false);
 const clear=signedOut.headers.get("set-cookie")||"";
 assert.match(clear,/agency_portal_session=/);
 assert.match(clear,/max-age=0|expires=/i,"logout must clear browser cookie");
 assert.equal((await session("agency_portal_session=")).authenticated,false,"cleared cookie must be signed out");
 process.stdout.write("REACH owner and Neon verification HTTP acceptance: 35 checks passed with synthetic secrets; no external requests.\n");
}finally{
 if(server.exitCode===null){
  server.kill("SIGTERM");
  await Promise.race([new Promise(r=>server.once("exit",r)),delay(2500)]);
  if(server.exitCode===null)server.kill("SIGKILL");
 }
}
