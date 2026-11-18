import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validCalendarRange,localMonthBounds,shiftMonth,localDayKey,CALENDAR_MAX_ITEMS} from "../ghl-gpt-gateway/lib/social-calendar-contract.ts";
test("UTC range validation limits calendar queries to 45 days",()=>{
 assert(validCalendarRange("2026-10-01T00:00:00.000Z","2026-11-01T00:00:00.000Z"));
 assert(!validCalendarRange("2026-01-01T00:00:00.000Z","2026-04-01T00:00:00.000Z"));
 assert(!validCalendarRange("garbage","2026-11-01T00:00:00.000Z"));
 assert(!validCalendarRange("2026-11-01T00:00:00.000Z","2026-10-01T00:00:00.000Z"));
 assert.equal(CALENDAR_MAX_ITEMS,500);
});
test("month navigation handles year transitions and local-day grouping",()=>{
 assert.equal(shiftMonth("2026-12",1),"2027-01");
 assert.equal(shiftMonth("2027-01",-1),"2026-12");
 assert(localMonthBounds("2026-10")?.start.endsWith("Z"));
 assert.equal(localMonthBounds("2026-13"),null);
 assert.equal(localDayKey("2026-10-29T12:00:00.000Z").length,10);
});
test("calendar and delivery monitor enforce tenant queries and stage administrator gate",()=>{
 for(const name of ["calendar","monitor"]){
  const src=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/social/"+name+"/route.ts",import.meta.url),"utf8");
  assert(src.includes("gate(req)"));
  assert(src.includes("workspaceFromQuery(req)"));
 }
 const cal=readFileSync(new URL("../ghl-gpt-gateway/lib/social-calendar-store.ts",import.meta.url),"utf8");
 assert(cal.includes("workspace_id=$1::uuid"));
 assert(cal.includes("LIMIT $4"));
 const monitor=readFileSync(new URL("../ghl-gpt-gateway/lib/social-monitor-store.ts",import.meta.url),"utf8");
 assert(monitor.includes("j.workspace_id=$1::uuid"));
 assert(monitor.includes("autoRecoveryEnabled:false"));
 assert(!monitor.includes("send("));
});
