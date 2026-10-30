import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("single-administrator mode disables the entire reservation lifecycle",()=>{
 const list=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/users/route.ts",import.meta.url),"utf8");
 const patch=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/users/[id]/route.ts",import.meta.url),"utf8");
 const page=readFileSync(new URL("../ghl-gpt-gateway/app/page.tsx",import.meta.url),"utf8");
 assert(list.includes("maxUsers:1")&&list.includes("remaining:0"));
 assert(list.includes("export async function POST()"));
 assert(list.includes("status:410"));
 assert(patch.includes("status:410"));
 assert(!page.includes("UserSeats"));
 assert(!page.includes('label:"User Seats (5)"'));
});
test("the only login supported is the existing administrator session",()=>{
 const auth=readFileSync(new URL("../ghl-gpt-gateway/lib/portal-auth.ts",import.meta.url),"utf8");
 assert(auth.includes("adminAuthenticated"));
 assert(auth.includes("validSession"));
 const route=readFileSync(new URL("../ghl-gpt-gateway/app/api/portal/session/route.ts",import.meta.url),"utf8");
 assert(route.includes("passwordValid"));
});
