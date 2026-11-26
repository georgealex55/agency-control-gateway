import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");
const ts=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url))("typescript");
const code=ts.transpileModule(read("lib/social-meta-automation-contract.ts"),{compilerOptions:{
 module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022
}}).outputText;
const core=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const base={workspaceId:"9df73aab-f6c7-43ea-9efe-e78911501420",
 connectionId:"f318bd99-ac35-4975-b160-c231e414c171",
 idempotencyKey:"8757f36f-f5d2-4364-abcb-fdb723ef7713",
 kind:"instagram_photo",body:"A safe approved business post",mediaUrl:"https://media.example.com/flower.jpg",
 targetId:null,scheduledAt:"2026-11-27T12:00:00.000Z"};
const now=Date.parse("2026-11-26T18:00:00Z");
test("only business-scoped, idempotent drafts with valid times and content are allowed",()=>{
 const draft=core.parseActionDraft(base,now);
 assert.equal(draft.kind,"instagram_photo");
 assert.equal(draft.mediaUrl,base.mediaUrl);
 for(const patch of [
  {idempotencyKey:"not-uuid"},{workspaceId:"other"},{body:""},
  {scheduledAt:"2025-01-01T12:00:00Z"},{scheduledAt:"2027-08-01T12:00:00Z"},
  {mediaUrl:"http://media.example.com/x.jpg"},{mediaUrl:"https://localhost/private"},
  {mediaUrl:"https://127.0.0.1/private"},{mediaUrl:"https://10.0.0.3/a"},
  {mediaUrl:"https://user:password@media.example.com/path"},
  {mediaUrl:"https://169.254.169.254/latest"},{kind:"instagram_spam"},
  {targetId:"123456789123"}
 ])assert.equal(core.parseActionDraft({...base,...patch},now),null,JSON.stringify(patch));
 assert.equal(core.validForProvider("facebook_post","facebook_pages"),true);
 assert.equal(core.validForProvider("facebook_post","instagram_professional"),false);
 assert.equal(core.outboundFeature("facebook_message_reply"),"messages");
 assert.equal(core.outboundFeature("instagram_comment_reply"),"comments");
});
test("replies require an event-derived provider target, never arbitrary recipients",()=>{
 assert.equal(core.parseActionDraft({...base,kind:"facebook_message_reply",mediaUrl:null,targetId:"123456789000"},now)?.targetId,"123456789000");
 assert.equal(core.parseActionDraft({...base,kind:"facebook_message_reply",mediaUrl:null,targetId:null},now),null);
 assert.equal(core.parseActionDraft({...base,kind:"facebook_post",mediaUrl:null,targetId:"123456789000"},now),null);
});
test("feature flags default to off and webhook verification is independently gated",()=>{
 const flags=core.metaAutomationFlags({});
 assert.deepEqual(flags,{liveWrites:false,scheduled:false,webhook:false});
 const testFlags=core.metaAutomationFlags({SOCIAL_META_LIVE_DELIVERY_ENABLED:"true",SOCIAL_META_AUTO_POST_ENABLED:"true",
  SOCIAL_META_WEBHOOKS_ENABLED:"true",SOCIAL_META_WEBHOOK_VERIFY_TOKEN:"abcdefghijklmnopqrstuvwxyz_123"});
 assert.deepEqual(testFlags,{liveWrites:true,scheduled:true,webhook:true});
 assert.equal(core.secureEqual("abc","abc"),true);
 assert.equal(core.secureEqual("abc","abd"),false);
});
test("database migration applies per-workspace RLS and strict delivery states",()=>{
 const sql=read("db/reach-meta-automation/V001__owner_meta_actions_webhooks.sql");
 assert.match(sql,/agency_social_meta_actions/);
 assert.match(sql,/agency_social_meta_webhook_events/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/CREATE POLICY reach_runtime_scope/);
 assert.match(sql,/current_setting\('reach.workspace_id',true\)/);
 assert.match(sql,/UNIQUE \(workspace_id,idempotency_key\)/);
 assert.match(sql,/status IN \('draft','approved','sending','sent','uncertain','blocked','canceled'\)/);
 assert.match(sql,/GRANT SELECT,INSERT,UPDATE ON public.agency_social_meta_actions TO reach_app_runtime/);
 assert.doesNotMatch(sql,/GRANT ALL|GRANT .* TO PUBLIC|encrypted_access_token/);
});
test("owner API separates draft creation, explicit approval, and confirmed live execution",()=>{
 const api=read("app/api/platform/social/meta/automation/route.ts");
 const dispatch=read("app/api/platform/social/meta/automation/dispatch/route.ts");
 const cron=read("app/api/platform/social/meta/automation/cron/route.ts");
 const provider=read("lib/social-meta-automation-provider.ts");
 const store=read("lib/social-meta-automation-store.ts");
 for(const path of [api,dispatch]){assert.match(path,/connectionGate\(req,true\)/);assert.match(path,/confirm!==true/);}
 assert.match(api,/requiresApproval:true/);
 assert.match(store,/FOR UPDATE OF a SKIP LOCKED/);
 assert.match(store,/a\.approved_at IS NOT NULL/);
 assert.match(store,/c\.revoked_at IS NULL/);
 assert.match(store,/ON CONFLICT\(workspace_id,idempotency_key\) DO NOTHING/);
 assert.match(store,/authorizedReplyTarget/);
 assert.match(store,/24 hours/);
 assert.match(dispatch,/SOCIAL_META_LIVE_DELIVERY_ENABLED/);
 assert.match(provider,/SOCIAL_META_LIVE_DELIVERY_ENABLED/);
 assert.match(provider,/inspectMetaToken/);
 assert.match(provider,/authorizedReplyTarget/);
 assert.match(provider,/facebookPageToken/);
 assert.match(provider,/media_publish/);
 assert.match(provider,/\/messages/);
 assert.match(cron,/CRON_SECRET/);
 assert.match(cron,/SOCIAL_META_AUTO_POST_ENABLED/);
 assert.doesNotMatch(cron,/connectionGate\(/);
});
test("Meta webhook verifies challenge and HMAC signature, maps saved account, and never sends messages",()=>{
 const h=read("app/api/platform/social/meta/webhook/route.ts");
 assert.match(h,/hub.verify_token/);
 assert.match(h,/x-hub-signature-256/);
 assert.match(h,/createHmac\("sha256"/);
 assert.match(h,/timingSafeEqual/);
 assert.match(h,/metaWebhookConnection/);
 assert.match(h,/recordMetaInbound/);
 assert.match(h,/m\?\.is_echo===true/);
 assert.doesNotMatch(h,/deliverMetaAction|sendMessage|\/media_publish|\/feed/);
});
test("Social Studio includes manual approval, simulation and webhook readiness",()=>{
 const ui=read("app/meta-automation-panel.tsx");
 const studio=read("app/social-studio.tsx");
 assert.match(ui,/Save draft — do not send/);
 assert.match(ui,/Approve/);
 assert.match(ui,/Simulate due posts \(no sending\)/);
 assert.match(ui,/window\.confirm/);
 assert.match(ui,/\/api\/platform\/social\/meta\/automation/);
 assert.match(ui,/Incoming interaction/);
 assert.match(ui,/webhook/i);
 assert.match(studio,/\["automations","Automations"\]/);
 assert.match(studio,/<MetaAutomationPanel/);
});
