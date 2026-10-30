import test from "node:test";
import assert from "node:assert/strict";
import {listFacebookPages} from "../ghl-gpt-gateway/lib/social-meta-pages.ts";
test("Facebook Pages discovery is strictly GET, fixed host, no token leakage",async()=>{
 const req=[];
 const fetcher=async(url,init)=>{
  req.push({url,init});
  return {ok:true,json:async()=>({data:[{id:"100200300",name:"QA Page",tasks:["ANALYZE"],access_token:"SECRET_MUST_BE_DISCARDED"}],paging:{next:"http://evil.test/credential"}})};
 };
 const pages=await listFacebookPages({token:"FAKE_STAGING_TOKEN",version:"v27.0",fetcher});
 assert.deepEqual(pages,[{id:"100200300",name:"QA Page",tasks:["ANALYZE"]}]);
 assert.equal(req.length,1);
 assert.equal(req[0].init.method,"GET");
 assert.equal(req[0].init.headers.Authorization,"Bearer FAKE_STAGING_TOKEN");
 assert.equal(req[0].init.redirect,"error");
 assert(req[0].url.startsWith("https://graph.facebook.com/v27.0/me/accounts?"));
 assert(!JSON.stringify(pages).includes("SECRET_MUST_BE_DISCARDED"));
});
test("Graph errors, unsupported versions, oversized Pages fail closed",async()=>{
 const fake=async()=>({ok:true,json:async()=>({data:new Array(26).fill({id:"100",name:"Fake"})})});
 await assert.rejects(()=>listFacebookPages({token:"FAKE_TEST_TOKEN",version:"v27.0",fetcher:fake}),/limit/);
 await assert.rejects(()=>listFacebookPages({token:"FAKE_TEST_TOKEN",version:"latest",fetcher:fake}),/configuration/);
 await assert.rejects(()=>listFacebookPages({token:"FAKE_TEST_TOKEN",version:"v27.0",fetcher:async()=>({ok:false})}),/denied/);
});
