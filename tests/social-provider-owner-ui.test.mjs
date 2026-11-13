import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../ghl-gpt-gateway/app/social-studio.tsx",import.meta.url),"utf8");
test("owner UI renders tenant-scoped provider status without inventing connections",()=>{
 assert.match(ui,/providers\.map\(provider=>/);
 assert.match(ui,/provider\.connectionStatus\.replaceAll/);
 assert.match(ui,/provider\.connectedAccounts>0/);
 assert.match(ui,/No active account verified in this workspace/);
 assert.match(ui,/Publishing disabled/);
 assert.match(ui,/workspaceId=\"\+encodeURIComponent\(id\)/);
});
test("owner UI shows provider setup and consent scopes without exposing tokens",()=>{
 assert.match(ui,/provider\.appSetup/);
 assert.match(ui,/provider\.scopes\.join/);
 assert.match(ui,/OAuth disabled/);
 assert.doesNotMatch(ui,/localStorage\.setItem\([^\n]*token/i);
});
test("refresh updates Meta inventory and unified provider registry",()=>{
 assert.match(ui,/void refreshMeta\(\);void refreshProviders\(\);/);
 assert.match(ui,/aria-label="Social provider connection statuses"/);
});
