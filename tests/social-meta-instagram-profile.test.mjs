import test from "node:test";
import assert from "node:assert/strict";
import {readInstagramProfessionalProfile} from "../ghl-gpt-gateway/lib/social-meta-instagram.ts";
const token="SYNTHETIC_INSTAGRAM_TOKEN_1234567890";
const request=(payload,ok=true)=>async(url,init)=>{
 assert.equal(new URL(url).origin,"https://graph.instagram.com");
 assert.equal(new URL(url).pathname,"/v26.0/me");
 assert.equal(init.method,"GET");assert.equal(init.redirect,"error");
 assert.equal(init.headers.Authorization,"Bearer "+token);
 return {ok,json:async()=>payload};
};
const read=(payload,ok=true)=>readInstagramProfessionalProfile({token,version:"v26.0",fetcher:request(payload,ok)});
test("Instagram BUSINESS profile is projected without provider token",async()=>{
 const profile=await read({id:"1234567890",user_id:"1234567890",username:"synthetic.brand",account_type:"BUSINESS",media_count:12,access_token:"SHOULD_NOT_LEAK"});
 assert.deepEqual(profile,{id:"1234567890",username:"synthetic.brand",accountType:"BUSINESS",mediaCount:12});
 assert.equal(JSON.stringify(profile).includes("SHOULD_NOT_LEAK"),false);
});
test("Instagram CREATOR identity is eligible and invalid media count becomes null",async()=>{
 assert.deepEqual(await read({user_id:"1234567890",username:"creator_qa",account_type:"CREATOR",media_count:-5}),{id:"1234567890",username:"creator_qa",accountType:"CREATOR",mediaCount:null});
});
test("Instagram personal, unknown and missing account types cannot stage a professional connection",async()=>{
 for(const account_type of ["PERSONAL","UNKNOWN",null,undefined]){
  await assert.rejects(()=>read({user_id:"1234567890",username:"qa_account",account_type}),/Professional account required/);
 }
});
test("Instagram rejects conflicting account IDs and invalid profile identities",async()=>{
 await assert.rejects(()=>read({id:"1234567890",user_id:"9876543210",username:"qa",account_type:"BUSINESS"}),/Conflicting Instagram identity/);
 await assert.rejects(()=>read({user_id:"bad",username:"qa",account_type:"BUSINESS"}),/Invalid Instagram professional identity/);
 await assert.rejects(()=>read({user_id:"1234567890",username:"invalid space",account_type:"CREATOR"}),/Invalid Instagram professional identity/);
});
test("Instagram rejects non-success and malformed provider payloads",async()=>{
 await assert.rejects(()=>readInstagramProfessionalProfile({token,version:"v26.0",fetcher:request({},false)}),/rejected/);
 for(const payload of [[],null,"not-json"]){
  await assert.rejects(()=>read(payload),/Invalid Instagram profile response/);
 }
});
