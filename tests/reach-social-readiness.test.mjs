import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");
test("Meta social readiness connects to exact hub status, never treats setup as connected",()=>{
 const page=read("app/connections/page.tsx"),ui=read("app/connections/social-readiness.tsx");
 assert.match(page,/SocialReadiness meta=\{hub.meta\} storageApproved=\{hub.storageApproved\} onConfigured=/);
 assert.match(ui,/item\.launchEnabled/);
 assert.match(ui,/storageApproved/);
 assert.match(ui,/Missing developer configuration/);
 assert.match(ui,/Publishing & messaging/);
 assert.match(ui,/Disabled/);
 assert.match(ui,/api\/platform\/social\/meta\/callback/);
 assert.match(ui,/developers\.facebook\.com\/apps\//);
 assert.doesNotMatch(ui,/SOCIAL_META_FACEBOOK_CLIENT_SECRET=|SOCIAL_META_INSTAGRAM_CLIENT_SECRET=|console\.log|localStorage/);
});
