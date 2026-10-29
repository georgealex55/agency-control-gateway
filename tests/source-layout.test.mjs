import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PLATFORM_SERVICES } from "../ghl-gpt-gateway/lib/platform-services.ts";
const lock=JSON.parse(readFileSync(new URL("../services/UPSTREAM_LOCK.json",import.meta.url),"utf8"));
const gitmodules=readFileSync(new URL("../.gitmodules",import.meta.url),"utf8");
test("pinned checkouts exist as gitlinks, not Vercel app files",()=>{
 const tree=execFileSync("git",["ls-tree","-r","HEAD","services/sources"],{encoding:"utf8"});
 const files=new Map(tree.trim().split("\n").filter(Boolean).map(line=>{
  const m=line.match(/^160000 commit ([a-f0-9]{40})\t(.+)$/);
  assert(m,"Not a gitlink: "+line);
  return [m[2],m[1]];
 }));
 assert.equal(files.size,lock.services.length);
 for(const s of lock.services) {
  assert.equal(files.get(s.path),s.commit,"Revision mismatch "+s.id);
  assert(gitmodules.includes("path = "+s.path),"Missing .gitmodules entry "+s.id);
  assert(!s.path.startsWith("ghl-gpt-gateway"),"Upstream code should not be Next.js app content");
 }
});
test("product services use pinned upstream repositories",()=>{
 const origins=new Set(lock.services.map(s=>s.origin));
 assert.equal(new Set(PLATFORM_SERVICES.map(s=>s.id)).size,PLATFORM_SERVICES.length);
 for(const s of PLATFORM_SERVICES) {
  assert(s.upstream.length>0);
  assert.equal(s.deployment,"external");
  assert(s.upstream.every(origin=>origins.has(origin)),"Unpinned source "+s.id);
 }
});
test("GHL and paid automation remain disabled",()=>{
 assert.equal(lock.noGhlImports,true);
 assert.equal(PLATFORM_SERVICES.find(x=>x.id==="automation")?.status,"deferred");
 assert(PLATFORM_SERVICES.every(s=>s.status!=="running"));
});
