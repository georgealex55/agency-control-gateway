import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");
const ts=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url))("typescript");
let source=read("lib/reach-customer-invitations.ts")
 .replace('import {neon} from "@neondatabase/serverless";',
 'const neon=()=>({query:async(sql,params)=>globalThis.__inviteDb(sql,params)});')
 .replace('import {isCustomerRole,workspaceIsValid,type CustomerRole} from "@/lib/reach-customer-access";',
 'const isCustomerRole=r=>["client_owner","client_editor","instructor","viewer"].includes(r); const workspaceIsValid=id=>/^[a-f0-9-]{36}$/.test(id);');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const api=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
const workspaceA="11111111-1111-4111-8111-111111111111",workspaceB="22222222-2222-4222-8222-222222222222";
const alpha="7c225b52-d570-4bbf-b3b7-f418d91a43c2",beta="d1c97638-0b48-4eee-a92b-fcf62bb7c922";
const digest=t=>createHash("sha256").update(t).digest("hex");
test("invitation handler requires staging, owner cookie, same-origin and no external mail",()=>{
 const owner=read("app/api/reach/customer/invitations/route.ts");
 const accept=read("app/api/reach/customer/invitations/accept/route.ts");
 assert.match(owner,/adminAuthenticated\(req\)/);
 assert.match(owner,/sameOrigin\(req\)/);
 assert.match(owner,/process\.env\.VERCEL_ENV!=="preview"/);
 assert.match(owner,/emailSent:false/);
 assert.match(owner,/delivery:"manual_only"/);
 assert.match(accept,/customerIdentityFromRequest\(req\)/);
 assert.match(accept,/sameOrigin\(req\)/);
 assert.match(accept,/process\.env\.VERCEL_ENV!=="preview"/);
 assert.match(accept,/acceptCustomerInvitation\(identity,token\)/);
 for(const v of [owner,accept])assert.doesNotMatch(v,/Resend|sendEmail|sendMessage|publishPost|SOCIAL_META_TOKEN_KEY|client_secret|localStorage/);
});
test("staging invitations issue unpredictable nonpersistent raw tokens, bind user and workspace, reject replay",async()=>{
 const prev={flag:process.env.REACH_CUSTOMER_AUTH_ENABLED,dsn:process.env.REACH_CUSTOMER_INVITES_DATABASE_URL};
 process.env.REACH_CUSTOMER_AUTH_ENABLED="true";
 process.env.REACH_CUSTOMER_INVITES_DATABASE_URL="postgresql://reach_invite_runtime:synthetic-pass@ep-fixture.c-2.us-east-2.aws.neon.tech/reach_platform?sslmode=require";
 const store=new Map();
 const identities=new Map([[alpha,"reach.stage.alpha@example.com"],[beta,"reach.stage.beta@example.com"]]);
 const verified=new Set([alpha,beta]);
 globalThis.__inviteDb=async (sql,params)=>{
  if(sql.includes(".issue(")){
   const [hash,workspace,email,role]=params;
   assert.match(hash,/^[0-9a-f]{64}$/);
   assert.equal(store.has(hash),false);
   store.set(hash,{workspace,email,role,used:false});
   return[{issued:true}];
  }
  if(sql.includes(".accept(")){
   const [hash,subject]=params;
   const record=store.get(hash);
   const sub=subject.replace("neon_auth:","");
   const allowed=Boolean(record&&!record.used&&verified.has(sub)&&identities.get(sub)===record.email);
   if(allowed)record.used=true;
   return[{accepted:allowed}];
  }
  throw Error("Unexpected invitation query");
 };
 try{
  assert.equal(api.invitesAvailable(),true);
  const t=await api.issueCustomerInvitation({workspaceId:workspaceA,email:"Reach.Stage.Alpha@Example.com",role:"viewer"});
  assert.match(t,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(store.has(digest(t)),true);
  assert.equal(await api.acceptCustomerInvitation({subject:beta},t),false);
  assert.equal(await api.acceptCustomerInvitation({subject:alpha},t),true);
  assert.equal(await api.acceptCustomerInvitation({subject:alpha},t),false);
  const second=await api.issueCustomerInvitation({workspaceId:workspaceB,email:"reach.stage.beta@example.com",role:"client_editor"});
  verified.delete(beta);
  assert.equal(await api.acceptCustomerInvitation({subject:beta},second),false);
  verified.add(beta);
  assert.equal(await api.acceptCustomerInvitation({subject:beta},second),true);
  assert.equal(await api.acceptCustomerInvitation({subject:alpha},second),false);
  assert.notEqual(t,second);
  assert.equal(await api.acceptCustomerInvitation({subject:alpha},"forged-token"),false);
  await assert.rejects(api.issueCustomerInvitation({workspaceId:workspaceA,email:"wrong",role:"viewer"}));
  await assert.rejects(api.issueCustomerInvitation({workspaceId:workspaceA,email:"reach.stage.alpha@example.com",role:"admin"}));
 }finally{
  if(prev.flag===undefined)delete process.env.REACH_CUSTOMER_AUTH_ENABLED;else process.env.REACH_CUSTOMER_AUTH_ENABLED=prev.flag;
  if(prev.dsn===undefined)delete process.env.REACH_CUSTOMER_INVITES_DATABASE_URL;else process.env.REACH_CUSTOMER_INVITES_DATABASE_URL=prev.dsn;
  delete globalThis.__inviteDb;
 }
});
test("SQL functions require verified email, expiry, one-time redemption and do not grant public table access",()=>{
 const sql=read("db/reach-customer/V002__staging_workspace_invitation_functions.sql");
 assert.match(sql,/CREATE OR REPLACE FUNCTION reach_customer_invites\.issue/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION reach_customer_invites\.accept/);
 assert.match(sql,/SECURITY DEFINER SET search_path=pg_catalog/);
 assert.match(sql,/emailVerified" IS TRUE/);
 assert.match(sql,/u\.banned IS DISTINCT FROM TRUE/);
 assert.match(sql,/LOWER\(u\.email\)=i\.email/);
 assert.match(sql,/accepted_at IS NULL AND i\.expires_at>NOW\(\)/);
 assert.match(sql,/ON CONFLICT\(workspace_id,identity_subject\) DO NOTHING/);
 assert.match(sql,/48 hours/);
 assert.match(sql,/REVOKE ALL ON SCHEMA reach_secret_invites FROM PUBLIC/);
 assert.doesNotMatch(sql,/GRANT (?:ALL|SELECT|UPDATE|DELETE|INSERT) ON public\./i);
});
test("user-facing login, registration and invite acceptance are separate from platform owner",()=>{
 const login=read("app/customer/sign-in/page.tsx");
 const register=read("app/customer/register/page.tsx");
 const accept=read("app/customer/invite/page.tsx");
 const owner=read("app/developer/meta/owner-customer-invitations.tsx");
 const console=read("app/developer/meta/developer-meta-console.tsx");
 assert.match(login,/customerAuthClient\.signIn\.email/);
 assert.match(login,/customerAuthClient\.getSession/);
 assert.match(register,/customerAuthClient\.signUp\.email/);
 assert.match(register,/emailOtp\.verifyEmail/);
 assert.match(accept,/\/api\/reach\/customer\/invitations\/accept/);
 assert.match(owner,/\/api\/reach\/customer\/invitations/);
 assert.match(console,/OwnerCustomerInvitations/);
 for(const s of [login,register,accept])assert.doesNotMatch(s,/AGENCY_PORTAL_|SOCIAL_META_TOKEN_KEY|clientSecret|localStorage/);
});
