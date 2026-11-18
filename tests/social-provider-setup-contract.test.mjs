import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../ghl-gpt-gateway/lib/social-provider-catalog.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/social/providers/route.ts",import.meta.url),"utf8");
test("LinkedIn uses OIDC identity scopes without publishing",()=>{
 assert.match(source,/id:"linkedin"[^\n]*scopes:\["openid","profile","email"\],publishScopes:\[\]/);
 assert.match(source,/linkedin:\{mode:"identity_only",enabled:false/);
});
test("TikTok read-only and YouTube read-only scopes are separate",()=>{
 assert.match(source,/id:"tiktok"[^\n]*scopes:\["user.info.basic"\],publishScopes:\[\]/);
 assert.match(source,/id:"youtube"[^\n]*youtube\.readonly"\],publishScopes:\[\]/);
 assert.match(source,/tiktok:\{mode:"profile_read_only",enabled:false/);
 assert.match(source,/youtube:\{mode:"channel_read_only",enabled:false/);
});
test("all extra providers remain disconnected and cannot publish",()=>{
 for(const key of ["linkedin","tiktok","youtube"])assert.match(source,new RegExp(key+':\\{[^\\n]*enabled:false[^\\n]*requiresConsent:true'));
 assert.match(source,/publishingEnabled:false,analyticsEnabled:false/);
 assert.match(route,/if\(!metaProvider\)return/);
 assert.match(route,/connectionStatus:"missing_config"/);
 assert.match(route,/publishingEnabled:false/);
});
