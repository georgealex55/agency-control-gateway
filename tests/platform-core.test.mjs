import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MODULES } from "../ghl-gpt-gateway/lib/agency-platform.ts";
import { PLATFORM_MODULE_KEYS, isModuleKey, validWorkspaceName, validSlug, validBusinessType, validWorkspaceId } from "../ghl-gpt-gateway/lib/platform-validation.ts";

test("module contract matches feature catalog",()=>{
 assert.deepEqual([...PLATFORM_MODULE_KEYS].sort(), MODULES.map(m=>m.key).sort());
 assert.equal(isModuleKey("website"),true);
 assert.equal(isModuleKey("lms"),true);
 assert.equal(isModuleKey("unknown"),false);
 assert.equal(isModuleKey("__proto__"),false);
});
test("workspace names reject blanks and excessive input",()=>{
 assert.equal(validWorkspaceName("Downtown Studio"),true);
 assert.equal(validWorkspaceName(" "),false);
 assert.equal(validWorkspaceName("x"),false);
 assert.equal(validWorkspaceName("X".repeat(121)),false);
});
test("slugs cannot contain unsafe path characters",()=>{
 assert.equal(validSlug("company-55"),true);
 for(const slug of ["x","ABC","foo/bar","hello world","foo--bar","foo_123",".env","-foo","foo-","x".repeat(60)])assert.equal(validSlug(slug),false,slug);
});
test("business types are an explicit allowlist",()=>{
 for(const type of ["website","education","marketing","general"])assert.equal(validBusinessType(type),true);
 assert.equal(validBusinessType("admin"),false);
});
test("workspace ids must be UUIDs and cannot be paths",()=>{
 assert.equal(validWorkspaceId(randomUUID()),true);
 for(const value of ["../", "client1", "000000000000", "invalid"])assert.equal(validWorkspaceId(value),false);
});
