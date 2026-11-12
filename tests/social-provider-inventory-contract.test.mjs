import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/social/providers/route.ts",import.meta.url),"utf8");
const inventory=readFileSync(new URL("../ghl-gpt-gateway/lib/social-meta-connection-store.ts",import.meta.url),"utf8");
test("provider status derives from scoped inventory, not only static catalog",()=>{
 assert.match(route,/gate\(req\)/);
 assert.match(route,/workspaceFromQuery\(req\)/);
 assert.match(route,/getMetaInventory\(workspaceId\)/);
 assert.match(inventory,/WHERE workspace_id=\$1::uuid/);
 assert.match(route,/authorization_pending/);
 assert.match(route,/read_only/);
 assert.match(route,/expired/);
});
test("provider status fails closed and does not return token fields",()=>{
 assert.match(route,/Social provider inventory unavailable/);
 assert.match(route,/503/);
 assert.match(route,/publishingEnabled:false/);
 assert.doesNotMatch(route,/encrypted_token|access_token|client_secret|token_value/);
});
