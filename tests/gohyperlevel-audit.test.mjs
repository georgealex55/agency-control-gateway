import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {GOHYPERLEVEL_REPO,GOHYPERLEVEL_SHA,GOHYPERLEVEL_AREAS,GOHYPERLEVEL_GATES,hyperlevelEvidence} from "../ghl-gpt-gateway/lib/gohyperlevel-audit.ts";
test("GoHyperLevel audit is immutable and covers all agency modules",()=>{
 assert.equal(GOHYPERLEVEL_REPO,"BAISESYSTEMS/GoHyperLevel");
 assert.match(GOHYPERLEVEL_SHA,/^[0-9a-f]{40}$/);
 assert.deepEqual(GOHYPERLEVEL_AREAS.map(x=>x.id),["crm","builder","lms","workflows","social","booking","inbox","agent"]);
 for(const row of GOHYPERLEVEL_AREAS){
  assert(row.evidence.length>0);
  assert(row.finding.length>12);
  assert(row.unverified.length>12);
  for(const p of row.evidence)assert(hyperlevelEvidence(p).includes("/blob/"+GOHYPERLEVEL_SHA+"/"+p));
 }
 assert(GOHYPERLEVEL_GATES.length>=5);
});
test("audit is read-only and cannot silently replace an original backend",()=>{
 const report=readFileSync(new URL("../docs/audits/gohyperlevel-source-audit-2026-11-04.md",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../ghl-gpt-gateway/app/gohyperlevel-audit.tsx",import.meta.url),"utf8");
 const catalog=readFileSync(new URL("../ghl-gpt-gateway/app/service-catalog.tsx",import.meta.url),"utf8");
 assert(report.includes("Evaluate but do not migrate"));
 assert(report.includes("Postiz"));
 assert(report.includes("SQLite"));
 assert(ui.includes("EVALUATION ONLY"));
 assert(ui.includes("Source coverage is not proof"));
 assert(catalog.includes("<GoHyperLevelAudit/>"));
 assert(!ui.includes("fetch("));
 assert(!ui.includes("axios"));
 assert.throws(()=>hyperlevelEvidence("server/unknown.ts"));
});
