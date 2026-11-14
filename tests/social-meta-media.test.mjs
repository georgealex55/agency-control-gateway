import test from "node:test";
import assert from "node:assert/strict";
import {MEDIA_MAX_BYTES,validMime,validMediaBytes,uploadAllowed,mediaSuffix} from "../ghl-gpt-gateway/lib/social-media-contract.ts";
import {buildMetaAuthorizeURL,validGraphVersion,validMetaRedirect,META_READ_PERMISSIONS,metaConfigured} from "../ghl-gpt-gateway/lib/social-meta-contract.ts";
test("private media validates actual file signatures and sizes",()=>{
 const jpeg=new Uint8Array(12);jpeg.set([255,216,255]);
 const png=new Uint8Array(12);png.set([137,80,78,71,13,10,26,10]);
 const webp=new Uint8Array(12);webp.set(new TextEncoder().encode("RIFF"),0);webp.set(new TextEncoder().encode("WEBP"),8);
 assert(validMediaBytes(jpeg,"image/jpeg"));
 assert(validMediaBytes(png,"image/png"));
 assert(validMediaBytes(webp,"image/webp"));
 assert(!validMediaBytes(new Uint8Array(12),"image/jpeg"));
 assert(!validMediaBytes(png,"image/jpeg"));
 assert(!validMediaBytes(new Uint8Array(MEDIA_MAX_BYTES+1),"image/png"));
 assert(!validMime("image/svg+xml"));
 assert.equal(mediaSuffix("image/webp"),"webp");
});
test("media uploads fail closed without a private store and an explicit flag",()=>{
 assert(!uploadAllowed({}));
 assert(!uploadAllowed({SOCIAL_MEDIA_UPLOADS_ENABLED:"true"}));
 assert(!uploadAllowed({BLOB_READ_WRITE_TOKEN:"secret"}));
 assert(!uploadAllowed({SOCIAL_MEDIA_UPLOADS_ENABLED:"true",BLOB_READ_WRITE_TOKEN:"secret"}));
 assert(uploadAllowed({SOCIAL_MEDIA_UPLOADS_ENABLED:"true",BLOB_READ_WRITE_TOKEN:"secret",BLOB_STORE_ID:"store_test0001",SOCIAL_MEDIA_STAGING_STORE_ID:"store_test0001"}));
});
test("Meta authorization builders separate two providers and only request read scopes",()=>{
 const common={clientId:"123456789012345",redirectUri:"https://staging.example.com/api/platform/social/meta/callback",state:"abcdefghijklmnopqrstuvwxyz0123456789",graphVersion:"v27.0"};
 const fb=new URL(buildMetaAuthorizeURL({...common,provider:"facebook_pages"}));
 const ig=new URL(buildMetaAuthorizeURL({...common,provider:"instagram_professional"}));
 assert.equal(fb.hostname,"www.facebook.com");
 assert.equal(ig.hostname,"www.instagram.com");
 assert.deepEqual(fb.searchParams.get("scope")?.split(","),["pages_show_list","pages_read_engagement"]);
 assert.deepEqual(ig.searchParams.get("scope")?.split(","),["instagram_business_basic"]);
 assert.equal(fb.searchParams.get("response_type"),"code");
 for(const scopes of Object.values(META_READ_PERMISSIONS))assert(!scopes.some(v=>/publish|manage_posts|manage_messages/.test(v)));
 assert.throws(()=>buildMetaAuthorizeURL({...common,redirectUri:"https://evil.example/other",provider:"facebook_pages"}));
});
test("OAuth configuration rejects untrusted callbacks and remains disabled until approved",()=>{
 assert(validGraphVersion("v27.0"));
 assert(!validGraphVersion("latest"));
 assert(validMetaRedirect("https://example.com/api/platform/social/meta/callback"));
 assert(!validMetaRedirect("http://localhost/api/platform/social/meta/callback"));
 assert(!validMetaRedirect("https://x.test/api/platform/social/meta/callback?redirect=https://evil.test"));
 assert(!metaConfigured({},"facebook_pages"));
});
test("private media and Meta callback cannot be used for publishing",async()=>{
 const {readFileSync}=await import("node:fs");
 const photo=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/social/media/route.ts",import.meta.url),"utf8");
 const meta=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/social/meta/callback/route.ts",import.meta.url),"utf8");
 assert(photo.includes('access:"private"'));
 assert(photo.includes("validMediaBytes"));
 assert(meta.includes("status:423"));
 assert(!meta.includes("access_token"));
});
