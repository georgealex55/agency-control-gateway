import test from "node:test";
import assert from "node:assert/strict";
import {validDryPayload,SOCIAL_DRY_TOPIC} from "../ghl-gpt-gateway/lib/social-queue-contract.ts";
import {stageEnabled,socialReadiness} from "../ghl-gpt-gateway/lib/social-contract.ts";
const w="8bba25e1-dc8e-4601-8bf2-91092f097bcc",j="62f2d771-46dd-49e9-b49d-4cc79ff3f3cd",p="bccf663f-097d-4324-a155-963b08eadb30";
test("queue payload cannot reference malformed or missing workspace",()=>{
 assert.equal(validDryPayload({jobId:j,workspaceId:w,postId:p}),true);
 for(const bad of [{jobId:j,workspaceId:"../other",postId:p},{jobId:j,workspaceId:w,postId:"not-a-post"},null,"hello",{}])assert.equal(validDryPayload(bad),false);
});
test("queue is explicitly a simulation only and cannot be enabled on production",()=>{
 assert.equal(SOCIAL_DRY_TOPIC,"agency-social-dry-run-v1");
 assert.equal(stageEnabled({VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:"feature/social-meta-media-stage-20261029",SOCIAL_STAGING_ENABLED:"true"}),false);
 assert.equal(stageEnabled({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feature/social-meta-media-stage-20261029",SOCIAL_STAGING_ENABLED:"true"}),true);
 const readiness=socialReadiness({});
 assert.equal(readiness.publishingEnabled,false);
 assert.equal(readiness.requiresPostiz,false);
});
