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

test("provider registry distinguishes configuration from a verified connection",()=>{
 assert.match(route,/type ConnectionState="disconnected"\|"missing_config"\|"authorization_pending"\|"read_only"\|"expired"\|"revoked"\|"error"/);
 assert.match(route,/SOCIAL_META_CONNECTIONS_ENABLED/);
 assert.match(route,/SOCIAL_META_REDIRECT_URI/);
 assert.match(route,/CLIENT_SECRET/);
 assert.match(route,/active\.length\?"read_only"/);
 assert.match(route,/linked\.length\?"expired"/);
 assert.match(route,/pending\?"authorization_pending"/);
 assert.match(route,/:"missing_config"/);
 assert.match(route,/permissionMode:active\.length\?"read_only":"disconnected"/);
 assert.match(route,/connectedAccounts:active\.length/);
});
test("workspace inventory is loaded only after admin staging gate and UUID validation",()=>{
 const auth=route.indexOf("gate(req)");
 const workspace=route.indexOf("workspaceFromQuery(req)");
 const validated=route.indexOf('if(!workspaceId)return reply');
 const lookup=route.indexOf("getMetaInventory(workspaceId)");
 assert.ok(auth>=0&&auth<workspace&&workspace<validated&&validated<lookup);
 assert.match(inventory,/FROM agency_social_meta_connections WHERE workspace_id=\$1::uuid/);
 assert.match(inventory,/FROM agency_social_meta_pending WHERE workspace_id=\$1::uuid/);
 assert.doesNotMatch(route,/decryptMetaToken|encrypted_access_token|client_secret|access_token/);
 assert.match(route,/status:"error"\},503/);
});
