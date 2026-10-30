import test from "node:test";
import assert from "node:assert/strict";
import {readInstagramProfessionalProfile} from "../ghl-gpt-gateway/lib/social-meta-instagram.ts";
test("Instagram profile reader accepts only fixed-host GET, hides tokens and validates response",async()=>{
 const seen=[];
 const fetcher=async(url,init)=>{
  seen.push({url,init});
  return {ok:true,json:async()=>({user_id:"17841400000000000",username:"studio.account",account_type:"CREATOR",media_count:19,access_token:"MUST_NOT_SURFACE"})};
 };
 const p=await readInstagramProfessionalProfile({token:"TEST_IG_BEARER_TOKEN",version:"v27.0",fetcher});
 assert.deepEqual(p,{id:"17841400000000000",username:"studio.account",accountType:"CREATOR",mediaCount:19});
 assert.equal(seen[0].init.method,"GET");
 assert.equal(seen[0].init.redirect,"error");
 assert.equal(seen[0].init.headers.Authorization,"Bearer TEST_IG_BEARER_TOKEN");
 assert(seen[0].url.startsWith("https://graph.instagram.com/v27.0/me?fields="));
 assert.equal(seen.length,1);
 assert(!JSON.stringify(p).includes("MUST_NOT_SURFACE"));
});
test("Instagram profile reader fails closed for spoofed responses and provider errors",async()=>{
 await assert.rejects(()=>readInstagramProfessionalProfile({token:"TEST_IG_BEARER_TOKEN",version:"bad",fetcher:async()=>({ok:true})}),/configuration/);
 await assert.rejects(()=>readInstagramProfessionalProfile({token:"TEST_IG_BEARER_TOKEN",version:"v27.0",fetcher:async()=>({ok:false})}),/rejected/);
 await assert.rejects(()=>readInstagramProfessionalProfile({token:"TEST_IG_BEARER_TOKEN",version:"v27.0",fetcher:async()=>({ok:true,json:async()=>({user_id:"not-an-id",username:"bad"})})}),/identity/);
});
