import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SOCIAL_PROBE_TOPIC,validQueueProbePayload} from "../ghl-gpt-gateway/lib/social-queue-probe-contract.ts";
const w="8bba25e1-dc8e-4601-8bf2-91092f097bcc",p="62f2d771-46dd-49e9-b49d-4cc79ff3f3cd";
test("probe messages have only UUID IDs and a distinct private topic",()=>{
 assert.equal(SOCIAL_PROBE_TOPIC,"agency-social-queue-probe-v1");
 assert(validQueueProbePayload({probeId:p,workspaceId:w}));
 for(const bad of [{probeId:p,workspaceId:"../other"},{probeId:"no",workspaceId:w},{workspaceId:w},null,[]])
  assert.equal(validQueueProbePayload(bad),false);
});
test("probe queue consumer cannot publish and checks branch flag",()=>{
 const consumer=readFileSync(new URL("../ghl-gpt-gateway/app/api/queues/social-queue-probe/route.ts",import.meta.url),"utf8");
 assert(consumer.includes("stageEnabled(process.env)"));
 assert(consumer.includes("validQueueProbePayload(payload)"));
 assert(consumer.includes("acknowledgeQueueProbe(payload)"));
 assert(!/fetch\(|graph\.facebook|instagram\.com|\.publish\(/.test(consumer));
 const config=JSON.parse(readFileSync(new URL("../ghl-gpt-gateway/vercel.json",import.meta.url),"utf8"));
 assert(config.functions["app/api/queues/social-queue-probe/route.ts"].experimentalTriggers.some(x=>x.topic===SOCIAL_PROBE_TOPIC));
});
test("probe API is admin protected and never claims delivered on send",()=>{
 const route=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/social/diagnostics/queue/route.ts",import.meta.url),"utf8");
 assert(route.includes("gate(req,true)"));
 assert(route.includes("gate(req)"));
 assert(route.includes("deliveryConfirmed:false"));
 assert(route.includes("retentionSeconds:3600"));
 const store=readFileSync(new URL("../ghl-gpt-gateway/lib/social-queue-probe-store.ts",import.meta.url),"utf8");
 assert(store.includes("UNIQUE")===false);
 assert(store.includes("status IN ('prepared','sent')"));
 assert(store.includes("workspace_id=$2::uuid"));
});
test("storage diagnostics prove an actual private read instead of guessing from env",()=>{
 const source=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/social/media/diagnostics/route.ts",import.meta.url),"utf8");
 assert(source.includes("await list({prefix:"));
 assert(source.includes("gate(req)"));
 assert(source.includes("checkedLive:true"));
 assert(!source.includes("BLOB_READ_WRITE_TOKEN"));
});

test("private image round-trip never returns a direct Blob URL and always attempts cleanup",()=>{
 const route=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/social/media/diagnostics/route.ts",import.meta.url),"utf8");
 assert(route.includes("gate(req,true)"));
 assert(route.includes("storage.uploadAllowed"));
 assert(route.includes('access:"private"'));
 assert(route.includes("received?.statusCode===200"));
 assert(route.includes("bytes.equals(original)"));
 assert(route.includes("finally"));
 assert(route.includes("await del(savedPath)"));
 assert(route.includes("roundTripVerified:success"));
 assert(!route.includes("return reply({url:"));
});
