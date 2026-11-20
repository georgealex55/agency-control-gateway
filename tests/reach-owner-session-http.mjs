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
 const deniedLogout=await logout({Origin:"https://untrusted.example",Cookie:cookie});
 assert.equal(deniedLogout.status,403,"cross-site logout must be refused");
 const signedOut=await logout({Origin:origin,Cookie:cookie});
 assert.equal(signedOut.status,200,"same-origin owner logout must succeed");
 assert.equal((await signedOut.json()).authenticated,false);
 const clear=signedOut.headers.get("set-cookie")||"";
 assert.match(clear,/agency_portal_session=/);
 assert.match(clear,/max-age=0|expires=/i,"logout must clear browser cookie");
 assert.equal((await session("agency_portal_session=")).authenticated,false,"cleared cookie must be signed out");
 process.stdout.write("REACH owner login HTTP acceptance: 12 checks passed with synthetic secrets; no external requests.\n");
}finally{
 if(server.exitCode===null){
  server.kill("SIGTERM");
  await Promise.race([new Promise(r=>server.once("exit",r)),delay(2500)]);
  if(server.exitCode===null)server.kill("SIGKILL");
 }
}
