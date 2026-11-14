import test from "node:test";
import assert from "node:assert/strict";
import {parseSocialInput,stageEnabled,validId} from "../ghl-gpt-gateway/lib/social-contract.ts";
import {readPostiz,postizStageConfigured} from "../ghl-gpt-gateway/lib/social-postiz.ts";

const now=Date.parse("2026-10-29T22:00:00.000Z");
const good={content:"Social test draft",state:"planned",channels:["instagram"],scheduledAt:"2026-10-29T23:00:00.000Z"};
test("draft and planned content contracts validate schedule and channels",()=>{
 assert.equal(parseSocialInput(good,now).state,"planned");
 assert.equal(parseSocialInput({...good,state:"draft",channels:[],scheduledAt:null},now).scheduledAt,null);
 assert.throws(()=>parseSocialInput({...good,state:"planned",channels:[]},now),/channel/);
 assert.throws(()=>parseSocialInput({...good,scheduledAt:"2026-10-29T21:59:00.000Z"},now),/15 minutes/);
 assert.throws(()=>parseSocialInput({...good,channels:["instagram","instagram"]},now),/channels/);
 assert.throws(()=>parseSocialInput({...good,content:"".padEnd(3001,"X")},now),/3000/);
 assert.throws(()=>parseSocialInput({...good,channels:["unknown"]},now),/channels/);
});
test("staging gate fails closed in production and on unreviewed branches",()=>{
 const required={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feature/social-meta-media-stage-20261029",SOCIAL_STAGING_ENABLED:"true"};
 assert.equal(stageEnabled(required),true);
 assert.equal(stageEnabled({...required,VERCEL_ENV:"production"}),false);
 assert.equal(stageEnabled({...required,VERCEL_GIT_COMMIT_REF:"main"}),false);
 assert.equal(stageEnabled({...required,SOCIAL_STAGING_ENABLED:"false"}),false);
});
test("Postiz stage config requires a tenant-locked organization",()=>{
 assert.equal(postizStageConfigured({}),false);
 assert.equal(postizStageConfigured({SOCIAL_POSTIZ_BASE_URL:"https://postiz.example",SOCIAL_POSTIZ_API_KEY:"abc"}),false);
 assert.equal(postizStageConfigured({SOCIAL_POSTIZ_BASE_URL:"https://postiz.example",SOCIAL_POSTIZ_API_KEY:"abc",SOCIAL_POSTIZ_ORG_ID:"org1",SOCIAL_POSTIZ_WORKSPACE_ID:"w1"}),true);
});
test("Postiz adapter performs only authenticated GET requests and validates organization",async()=>{
 const calls=[];
 const fake=async(input,init)=>{
  calls.push({input:String(input),method:init.method,headers:init.headers,redirect:init.redirect});
  return {ok:true,json:async()=>({organization:{id:"staging-org",name:"QA"}})};
 };
 const result=await readPostiz({baseUrl:"https://postiz.example/",key:"server-only-secret",organizationId:"staging-org",path:"/me",fetcher:fake});
 assert.equal(result.organization.id,"staging-org");
 assert.equal(calls.length,1);
 assert.equal(calls[0].method,"GET");
 assert.equal(calls[0].headers.Authorization,"server-only-secret");
 assert.equal(calls[0].redirect,"error");
 assert.equal(calls[0].input,"https://postiz.example/api/public/v1/me");
 await assert.rejects(()=>readPostiz({baseUrl:"https://postiz.example/",key:"secret",organizationId:"wrong-org",path:"/me",fetcher:fake}),/organization/);
 await assert.rejects(()=>readPostiz({baseUrl:"https://127.0.0.1/",key:"secret",organizationId:"staging-org",path:"/me",fetcher:fake}),/Private/);
 await assert.rejects(()=>readPostiz({baseUrl:"http://postiz.example/",key:"secret",organizationId:"staging-org",path:"/me",fetcher:fake}),/HTTPS/);
 await assert.rejects(()=>readPostiz({baseUrl:"https://postiz.example/",key:"secret",organizationId:"staging-org",path:"/posts/delete",fetcher:fake}),/Unsupported/);
 assert.equal(calls.length,2);
});
test("Postiz adapter returns authentic integration records without inventing analytics",async()=>{
 const fake=async()=>({ok:true,json:async()=>[{id:"ch-1",name:"Studio Instagram",identifier:"instagram",disabled:false}]});
 const result=await readPostiz({baseUrl:"https://postiz.example/",key:"secret",organizationId:"org1",path:"/integrations",fetcher:fake});
 assert.equal(result[0].identifier,"instagram");
});
test("UUID contract supports tenant-scoped route validation",()=>{
 assert.equal(validId("8bba25e1-dc8e-4601-8bf2-91092f097bcc"),true);
 for(const x of ["../other","", "id"])assert.equal(validId(x),false);
});
