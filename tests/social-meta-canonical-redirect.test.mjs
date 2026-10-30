import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {metaSetupStatus} from "../ghl-gpt-gateway/lib/social-meta-contract.ts";
const stableHost="agency-control-gateway-git-b83544-georgealex1925-2750s-projects.vercel.app";
const stableOrigin="https://"+stableHost;
const callback=stableOrigin+"/api/platform/social/meta/callback";
const configured={
 SOCIAL_META_FACEBOOK_CLIENT_ID:"123456789012345",
 SOCIAL_META_FACEBOOK_CLIENT_SECRET:"STAGING_FAKE_SECRET_NEVER_REAL",
 SOCIAL_META_INSTAGRAM_CLIENT_ID:"987654321098765",
 SOCIAL_META_INSTAGRAM_CLIENT_SECRET:"SECOND_FAKE_SECRET_NEVER_REAL",
 SOCIAL_META_GRAPH_VERSION:"v26.0",
 SOCIAL_META_OAUTH_STATE_SECRET:"staging-test-signing-secret-at-least-32-characters",
 SOCIAL_META_TOKEN_KEY:"A".repeat(43),
 SOCIAL_META_REDIRECT_URI:callback,
 VERCEL_BRANCH_URL:stableHost,
 SOCIAL_META_CONNECTIONS_ENABLED:"true"
};
test("staging OAuth readiness requires canonical branch hostname and explicit feature switch",()=>{
 const fb=metaSetupStatus(configured,"facebook_pages",stableOrigin);
 assert.equal(fb.launchEnabled,true);
 assert.deepEqual(fb.permissions,["pages_show_list","pages_read_engagement"]);
 assert.equal(fb.callbackUrl,callback);
 assert.equal(fb.isCanonicalHost,true);
 assert.equal(fb.branchMatches,true);
 assert.deepEqual(fb.missingSettings,[]);
 const unique=metaSetupStatus(configured,"facebook_pages","https://agency-control-gateway-unique.vercel.app");
 assert.equal(unique.launchEnabled,false);
 assert.equal(unique.isCanonicalHost,false);
 const wrongBranch=metaSetupStatus({...configured,VERCEL_BRANCH_URL:"other-git-branch.vercel.app"},"facebook_pages",stableOrigin);
 assert.equal(wrongBranch.launchEnabled,false);
 assert.equal(wrongBranch.branchMatches,false);
 const disabled=metaSetupStatus({...configured,SOCIAL_META_CONNECTIONS_ENABLED:"false"},"facebook_pages",stableOrigin);
 assert.equal(disabled.launchEnabled,false);
 assert.equal(disabled.featureEnabled,false);
});
test("setup readiness reports missing names only, and never exposes secrets",()=>{
 const result=metaSetupStatus({SOCIAL_META_REDIRECT_URI:callback},"instagram_professional",stableOrigin);
 assert.equal(result.launchEnabled,false);
 for(const field of ["SOCIAL_META_INSTAGRAM_CLIENT_ID","SOCIAL_META_INSTAGRAM_CLIENT_SECRET","SOCIAL_META_GRAPH_VERSION","SOCIAL_META_OAUTH_STATE_SECRET","SOCIAL_META_TOKEN_KEY"]){
  assert(result.missingSettings.includes(field));
 }
 const sample=metaSetupStatus(configured,"instagram_professional",stableOrigin);
 assert(!JSON.stringify(sample).includes(configured.SOCIAL_META_INSTAGRAM_CLIENT_SECRET));
 assert(!JSON.stringify(sample).includes(configured.SOCIAL_META_OAUTH_STATE_SECRET));
 assert(!JSON.stringify(sample).includes(configured.SOCIAL_META_TOKEN_KEY));
 assert.deepEqual(sample.permissions,["instagram_business_basic"]);
});
test("staging OAuth endpoints reject noncanonical preview hosts before redirect",()=>{
 const start=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/social/meta/start/route.ts",import.meta.url),"utf8");
 const callbackRoute=readFileSync(new URL("../ghl-gpt-gateway/app/api/platform/social/meta/callback/route.ts",import.meta.url),"utf8");
 assert(start.includes("setup.isCanonicalHost"));
 assert(start.includes("setup.branchMatches"));
 assert(callbackRoute.includes("setup.isCanonicalHost"));
 assert(callbackRoute.includes("setup.branchMatches"));
 assert(start.includes("gate(req,true)"));
 assert(start.includes("SOCIAL_META_CONNECTIONS_ENABLED"));
 assert(callbackRoute.includes("SOCIAL_META_CONNECTIONS_ENABLED"));
});
