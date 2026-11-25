import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../ghl-gpt-gateway/"+p,import.meta.url),"utf8");
test("owner-only setup does not expose credentials or enable unfinished connectors",()=>{
 const page=read("app/developer/video/page.tsx");
 assert.match(page,/if\(!validSession\(jar\.get\(cookieName\(\)\)\?\.value\)\)redirect/);
 assert.match(page,/Boolean\(process\.env\[p\.prefix\+"CLIENT_SECRET"\]\)/);
 assert.match(page,/SOCIAL_YOUTUBE_/);assert.match(page,/SOCIAL_TIKTOK_/);
 assert.match(page,/Not connected/);assert.match(page,/Do not add enable flags/);
 assert.match(page,/settings\/environment-variables/);
 assert.doesNotMatch(page,/<input|<form|fetch\(|localStorage|sessionStorage/);
 assert.match(read("app/connections/page.tsx"),/href="\/developer\/video"/);
});
