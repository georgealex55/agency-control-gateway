import test from "node:test";
import assert from "node:assert/strict";
import {parseMetaTokenPayload,exchangeInstagramLongLived,exchangeFacebookLongLived} from "../ghl-gpt-gateway/lib/social-meta-token-lifecycle.ts";
const now=Date.UTC(2026,9,29,0,0,0),short="SHORT_LIVED_META_1234567890",long="LONG_LIVED_META_0987654321",secret="FAKE_TEST_SECRET_ABCDEFG";
test("Meta token parser supports single wrapped Instagram token but rejects ambiguous results",()=>{
 assert.deepEqual(parseMetaTokenPayload({data:[{access_token:short,expires_in:3600}]},now),{token:short,expiresAt:new Date(now+3600*1000).toISOString()});
 assert.throws(()=>parseMetaTokenPayload({data:[{access_token:short},{access_token:long}]},now));
 assert.throws(()=>parseMetaTokenPayload({access_token:short,data:[{access_token:long}]},now));
 assert.throws(()=>parseMetaTokenPayload({data:[]},now));
 assert.throws(()=>parseMetaTokenPayload({expires_in:3600},now));
});
test("Instagram token exchange uses fixed read-only host and returns a durable expiration",async()=>{
 const calls=[];
 const fetcher=async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>({access_token:long,expires_in:5184000})};};
 const token=await exchangeInstagramLongLived({shortLivedToken:short,appSecret:secret,fetcher,now});
 assert.equal(token.token,long);assert.equal(Date.parse(token.expiresAt),now+5184000*1000);
 assert.equal(calls.length,1);
 const u=new URL(calls[0].url);
 assert.equal(u.origin,"https://graph.instagram.com");assert.equal(u.pathname,"/access_token");
 assert.equal(u.searchParams.get("grant_type"),"ig_exchange_token");
 assert.equal(calls[0].init.method,"GET");assert.equal(calls[0].init.redirect,"error");
});
test("Long-lived exchange fails closed on errors, missing expiration or short lifetime",async()=>{
 const base={shortLivedToken:short,appSecret:secret,now};
 await assert.rejects(()=>exchangeInstagramLongLived({...base,fetcher:async()=>({ok:false})}));
 await assert.rejects(()=>exchangeInstagramLongLived({...base,fetcher:async()=>({ok:true,json:async()=>({access_token:long})})}));
 await assert.rejects(()=>exchangeInstagramLongLived({...base,fetcher:async()=>({ok:true,json:async()=>({access_token:long,expires_in:45})})}));
});
test("Facebook long-lived exchange is also server-only and uses fixed Graph API host",async()=>{
 const requests=[];
 const fetcher=async(url,init)=>{requests.push({url,init});return {ok:true,json:async()=>({access_token:long,expires_in:5184000})};};
 const result=await exchangeFacebookLongLived({shortLivedToken:short,appId:"123456789012345",appSecret:secret,graphVersion:"v25.0",fetcher,now});
 assert.equal(result.token,long);
 const url=new URL(requests[0].url);
 assert.equal(url.origin,"https://graph.facebook.com");
 assert.equal(url.pathname,"/v25.0/oauth/access_token");
 assert.equal(url.searchParams.get("grant_type"),"fb_exchange_token");
 assert.equal(requests[0].init.redirect,"error");
});
