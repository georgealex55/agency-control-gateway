import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { MODULES, SAMPLE_TENANTS, entitled, canApprove } from "../ghl-gpt-gateway/lib/agency-platform.ts";
import { portalConfigured, passwordValid, newSession, validSession, sameOrigin } from "../ghl-gpt-gateway/lib/portal-auth.ts";

test("unique modules and three synthetic profiles",()=>{
  assert.equal(new Set(MODULES.map(m=>m.key)).size,MODULES.length);
  assert.equal(SAMPLE_TENANTS.length,3);
  assert(SAMPLE_TENANTS.every(t=>t.isExample));
});
test("only agency roles can approve",()=>{
  assert.equal(canApprove("client_owner"),false);
  assert.equal(canApprove("agency_owner"),true);
  assert.equal(canApprove("agency_admin"),true);
});
test("entitlement checks membership, approval, provisioning and billing",()=>{
  const grant={module:"website",approved:true,provisioned:true,billing:"active"};
  assert.equal(entitled("client_owner",grant),true);
  assert.equal(entitled(null,grant),false);
  assert.equal(entitled("client_owner",{...grant,approved:false}),false);
  assert.equal(entitled("client_owner",{...grant,provisioned:false}),false);
  assert.equal(entitled("client_owner",{...grant,billing:"unpaid"}),false);
});
test("portal fails closed when not configured",()=>{
  delete process.env.AGENCY_PORTAL_PASSWORD_SHA256;
  delete process.env.AGENCY_PORTAL_SESSION_SECRET;
  assert.equal(portalConfigured(),false);
  assert.equal(passwordValid("correct-but-not-configured"),false);
  assert.equal(validSession("invalid"),false);
});
test("administrator session is signed and tamper-resistant",()=>{
  const password="test-admin-strong-and-distinct";
  process.env.AGENCY_PORTAL_PASSWORD_SHA256=createHash("sha256").update(password).digest("hex");
  process.env.AGENCY_PORTAL_SESSION_SECRET="test-session-secret-different-than-the-password-hash";
  assert.equal(passwordValid(password),true);
  assert.equal(passwordValid("another-long-but-wrong-password"),false);
  const token=newSession();
  assert.equal(validSession(token),true);
  assert.equal(validSession(token+"-tampered"),false);
});
test("same-origin guard blocks cross-site POSTs",()=>{
  const req=(origin)=>({headers:{get:()=>origin},nextUrl:new URL("https://agency-control-gateway.vercel.app/api/portal/scan")});
  assert.equal(sameOrigin(req("https://agency-control-gateway.vercel.app")),true);
  assert.equal(sameOrigin(req("https://example.invalid")),false);
  assert.equal(sameOrigin(req(null)),false);
});
