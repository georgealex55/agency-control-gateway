import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");
const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
const ts=require("typescript");
const toJs=(code,path)=>ts.transpileModule(code,{fileName:path,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.Preserve},reportDiagnostics:true});
const moduleFrom=(code)=>import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const auth=await moduleFrom(toJs(read("lib/reach-customer-auth.ts"),"lib/reach-customer-auth.ts").outputText);
const isolatedAccess=read("lib/reach-customer-access.ts").replace(
 'import {neon} from "@neondatabase/serverless";',
 'const neon=()=>({query:async(sql,params)=>globalThis.__reachMembershipFixture(sql,params)});'
);
const access=await moduleFrom(toJs(isolatedAccess,"lib/reach-customer-access.ts").outputText);
const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const jwk=publicKey.export({format:"jwk"});
const issuedKey={...jwk,kid:"fixture-key-1",use:"sig",alg:"RS256"};
const issuer="https://sample-auth.neon.tech",audience="reach-customer";
const secret="synthetic-SESSION-SECRET-0123456789-0123456789-0123456789";
const now=1795456800;
const config={issuer,audience,jwksUrl:issuer+"/.well-known/jwks.json",sessionSecret:secret};
const b64=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
const issue=(claims={},header={})=>{
 const h=b64({alg:"RS256",kid:"fixture-key-1",typ:"JWT",...header});
 const p=b64({iss:issuer,aud:audience,sub:"customer_fixture_123",exp:now+600,iat:now-10,email_verified:true,...claims});
 return h+"."+p+"."+sign("RSA-SHA256",Buffer.from(h+"."+p),privateKey).toString("base64url");
};
const remote=async(url,opts)=>{
 assert.equal(url,config.jwksUrl);
 assert.equal(opts.redirect,"error");
 assert.equal(opts.method,"GET");
 assert.equal(opts.cache,"no-store");
 return new Response(JSON.stringify({keys:[issuedKey]}),{status:200,headers:{"Content-Type":"application/json"}});
};
test("customer identity enablement fails closed and refuses unrelated JWKS, weak secrets or non-Neon origins",()=>{
 const base={
  REACH_CUSTOMER_AUTH_ENABLED:"true",
  REACH_CUSTOMER_AUTH_ISSUER:issuer,
  REACH_CUSTOMER_AUTH_AUDIENCE:audience,
  REACH_CUSTOMER_AUTH_JWKS_URL:config.jwksUrl,
  REACH_CUSTOMER_SESSION_SECRET:secret
 };
 assert.deepEqual(auth.customerAuthConfig(base),config);
 for(const change of [
  {REACH_CUSTOMER_AUTH_ENABLED:"false"},
  {REACH_CUSTOMER_AUTH_ISSUER:"https://neon.tech.evil.example"},
  {REACH_CUSTOMER_AUTH_JWKS_URL:"http://sample-auth.neon.tech/.well-known/jwks.json"},
  {REACH_CUSTOMER_AUTH_JWKS_URL:"https://127.0.0.1/jwks"},
  {REACH_CUSTOMER_AUTH_ISSUER:"https://sample-auth.neon.tech/callback"},
  {REACH_CUSTOMER_AUTH_AUDIENCE:""},
  {REACH_CUSTOMER_SESSION_SECRET:"too-short"}
 ])assert.equal(auth.customerAuthConfig({...base,...change}),null);
});
test("cryptographically verified Neon JWT accepts only trusted key, audience, issuer and subject",async()=>{
 assert.deepEqual(await auth.verifyCustomerAssertion(issue(),config,remote,now),{subject:"customer_fixture_123"});
 for(const jwt of [
  issue({iss:"https://attacker.neon.tech"}),issue({aud:"incorrect"}),
  issue({exp:now}),issue({exp:now+25*3600}),issue({nbf:now+100}),issue({iat:now+100}),
  issue({sub:"bad subject"}),issue({email_verified:false}),issue({}, {alg:"none"}),
  issue({}, {jku:"https://evil.example/jwks"}),issue({}, {kid:"unknown"}),
  issue().slice(0,-3)+"aaa"
 ]){
  await assert.rejects(auth.verifyCustomerAssertion(jwt,config,remote,now));
 }
 await assert.rejects(auth.verifyCustomerAssertion(issue(),config,async()=>new Response(JSON.stringify({keys:[]})),now));
 await assert.rejects(auth.verifyCustomerAssertion(issue(),config,async()=>new Response(JSON.stringify({keys:[issuedKey,issuedKey]})),now));
});
test("customer session uses a separate signed HttpOnly-cookie value and expires after 15 minutes",()=>{
 const cookie=auth.createCustomerSession({subject:"customer_fixture_123"},secret,now);
 assert.deepEqual(auth.verifyCustomerSession(cookie,secret,now),{subject:"customer_fixture_123"});
 assert.equal(auth.verifyCustomerSession(cookie,secret,now+901),null);
 assert.equal(auth.verifyCustomerSession(cookie,"different-SECRET-length-000000000000000000000000",now),null);
 assert.equal(auth.verifyCustomerSession(cookie.slice(0,-5)+"aaaaa",secret,now),null);
 assert.equal(auth.verifyCustomerSession(undefined,secret,now),null);
 assert.equal(auth.customerCookieName(),"reach_customer_session");
 assert.equal(auth.customerCookieLifetime(),900);
});
test("membership RBAC has no route for external execution or owner escalation",()=>{
 for(const role of ["viewer","instructor","client_editor","client_owner"]){
  assert.equal(access.customerCan(role,"workspace:read"),true);
  assert.equal(access.customerCan(role,"connections:read"),true);
  assert.equal(access.customerCan(role,"external:execute"),false);
 }
 assert.equal(access.customerCan("viewer","content:edit"),false);
 assert.equal(access.customerCan("viewer","members:manage"),false);
 assert.equal(access.customerCan("instructor","content:edit"),true);
 assert.equal(access.customerCan("instructor","members:manage"),false);
 assert.equal(access.customerCan("client_editor","members:manage"),false);
 assert.equal(access.customerCan("client_owner","members:manage"),true);
 assert.equal(access.isCustomerRole("platform_admin"),false);
 assert.equal(access.workspaceIsValid("foreign-workspace"),false);
});
test("membership SQL always binds verified identity and requested workspace, denies different tenant",async()=>{
 const prior=process.env.REACH_CUSTOMER_DATABASE_URL,oldFlag=process.env.REACH_CUSTOMER_AUTH_ENABLED;
 process.env.REACH_CUSTOMER_AUTH_ENABLED="true";
 process.env.REACH_CUSTOMER_DATABASE_URL="postgresql://reach_customer_runtime:synthetic-pass@ep-test.us-east-2.aws.neon.tech/reach_platform?sslmode=require";
 const tenant1="11111111-1111-4111-8111-111111111111",tenant2="22222222-2222-4222-8222-222222222222";
 const subject={subject:"customer_fixture_123"};
 const observed=[];
 globalThis.__reachMembershipFixture=(sql,params)=>{
  observed.push({sql,params});
  assert.equal(params[0],"neon_auth:customer_fixture_123");
  assert.match(sql,/agency_platform_memberships/);
  assert.match(sql,/m\.identity_subject=\$1/);
  const record={id:tenant1,name:"Tenant A",slug:"tenant-a",role:"viewer"};
  return params[1]===tenant2?[]:[record];
 };
 try{
  assert.equal(access.customerDatabaseConfigured(),true);
  const rows=await access.listCustomerWorkspaces(subject);
  assert.deepEqual(rows.map(x=>x.id),[tenant1]);
  assert.equal((await access.requireCustomerWorkspace(subject,tenant1,"connections:read"))?.role,"viewer");
  assert.equal(await access.requireCustomerWorkspace(subject,tenant1,"members:manage"),null);
  assert.equal(await access.requireCustomerWorkspace(subject,tenant2,"workspace:read"),null);
  assert.equal(await access.requireCustomerWorkspace(subject,"not-a-uuid","workspace:read"),null);
  assert.match(observed[1].sql,/m\.workspace_id=\$2::uuid/);
  assert.deepEqual(observed[2].params,["neon_auth:customer_fixture_123",tenant1]);
  assert.deepEqual(observed[3].params,["neon_auth:customer_fixture_123",tenant2]);
  assert.equal(access.customerDatabaseConfigured({REACH_CUSTOMER_AUTH_ENABLED:"true",REACH_CUSTOMER_DATABASE_URL:"postgresql://admin:pass@localhost/reach_platform?sslmode=disable"}),false);
 }finally{
  if(prior===undefined)delete process.env.REACH_CUSTOMER_DATABASE_URL;else process.env.REACH_CUSTOMER_DATABASE_URL=prior;
  if(oldFlag===undefined)delete process.env.REACH_CUSTOMER_AUTH_ENABLED;else process.env.REACH_CUSTOMER_AUTH_ENABLED=oldFlag;
  delete globalThis.__reachMembershipFixture;
 }
});
test("customer endpoints never reuse owner cookie and customer auth cannot access Meta token vault",()=>{
 const login=read("app/api/reach/customer/session/route.ts");
 const route=read("app/api/reach/customer/workspaces/route.ts");
 const owner=read("lib/portal-auth.ts");
 const guard=read("lib/social-api.ts");
 const health=read("app/api/reach/connections/health/route.ts");
 assert.match(login,/verifyCustomerAssertion\(assertion,config\)/);
 assert.match(login,/listCustomerWorkspaces\(identity\)/);
 assert.match(login,/sameOrigin\(req\)/);
 assert.match(login,/httpOnly:true/);
 assert.match(login,/sameSite:"strict"/);
 assert.match(login,/customerCookieName\(\)/);
 assert.match(route,/customerIdentityFromRequest\(req\)/);
 assert.match(route,/requireCustomerWorkspace\(identity,requested,"workspace:read"\)/);
 assert.match(route,/Workspace unavailable/);
 assert.match(guard,/adminAuthenticated\(req\)/);
 assert.match(health,/connectionGate\(req\)/);
 assert.match(owner,/const COOKIE = "agency_portal_session"/);
 for(const code of [login,route]){
  assert.doesNotMatch(code,/adminAuthenticated|agency_portal_session|decryptMetaToken|encrypted_access_token|SOCIAL_META_TOKEN_KEY|sendMessage|publishPost/);
 }
});
test("restricted migration never touches production tokens or modifies owner tables",()=>{
 const sql=read("db/reach-customer/V001__read_only_customer_membership_grants.sql");
 assert.match(sql,/GRANT SELECT\(id,name,slug\)/);
 assert.match(sql,/GRANT SELECT\(workspace_id,identity_subject,role\)/);
 assert.match(sql,/reach_customer_runtime/);
 assert.doesNotMatch(sql,/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b|\bDROP\b|\bCREATE TABLE\b|\bGRANT ALL\b/i);
 for(const file of ["lib/reach-customer-auth.ts","lib/reach-customer-access.ts","app/api/reach/customer/session/route.ts",
  "app/api/reach/customer/workspaces/route.ts","app/customer/workspaces/page.tsx"]){
  const result=toJs(read(file),file);
  assert.equal((result.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,file);
 }
});
