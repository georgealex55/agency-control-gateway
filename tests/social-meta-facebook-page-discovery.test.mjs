import test from "node:test";
import assert from "node:assert/strict";
import {listFacebookPages} from "../ghl-gpt-gateway/lib/social-meta-pages.ts";

const token="synthetic-read-token-only";
const version="v26.0";
function mockPages(data){
 let requests=0;
 const fetcher=async (url,options)=>{
  requests++;
  assert.equal(url,"https://graph.facebook.com/v26.0/me/accounts?fields=id%2Cname%2Ctasks&limit=25");
  assert.equal(options.method,"GET");
  assert.equal(options.redirect,"error");
  assert.equal(options.headers.Authorization,"Bearer "+token);
  return {ok:true,json:async()=>({data})};
 };
 return {fetcher,get requests(){return requests}};
}

test("Facebook Page discovery returns only allowlisted identity fields",async()=>{
 const mock=mockPages([{id:"12345",name:"Synthetic Page",tasks:["ANALYZE","MODERATE"],access_token:"must-not-leak",picture:{data:{url:"secret"}}}]);
 const pages=await listFacebookPages({token,version,fetcher:mock.fetcher});
 assert.deepEqual(pages,[{id:"12345",name:"Synthetic Page",tasks:["ANALYZE","MODERATE"]}]);
 assert.equal(JSON.stringify(pages).includes("must-not-leak"),false);
 assert.equal(mock.requests,1);
});
test("Facebook Page discovery rejects duplicate account identities before selection",async()=>{
 const mock=mockPages([{id:"12345",name:"Page A"},{id:"12345",name:"Page B"}]);
 await assert.rejects(listFacebookPages({token,version,fetcher:mock.fetcher}),/Duplicate Facebook Page identity/);
 assert.equal(mock.requests,1);
});
test("Facebook Page discovery rejects malformed and oversized inventories",async()=>{
 for(const data of [[{id:"12345",name:"Valid"},{id:"not-a-page",name:"Bad"}],Array.from({length:26},(_,i)=>({id:String(i+100),name:"Synthetic"}))]){
  await assert.rejects(listFacebookPages({token,version,fetcher:mockPages(data).fetcher}));
 }
});
test("Facebook Page discovery rejects unauthorized provider response",async()=>{
 await assert.rejects(listFacebookPages({token,version,fetcher:async()=>({ok:false})}),/denied/);
});
