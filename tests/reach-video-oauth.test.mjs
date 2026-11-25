import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(new URL("../ghl-gpt-gateway/package.json",import.meta.url));
const ts=require("typescript");
const source=readFileSync(new URL("../ghl-gpt-gateway/lib/reach-video-oauth.ts",import.meta.url),"utf8").replace('import "server-only";',"");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {videoOAuthConfig,buildVideoAuthorizeUrl,exchangeVideoCode,refreshVideoToken,discoverVideoAccounts}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const origin="https://example.test",state="s".repeat(43),verifier="v".repeat(43);
const config=provider=>({provider,clientId:"fake-client",clientSecret:"fake-secret",redirectUri:origin+"/api/reach/connections/"+provider+"/callback"});
const response=v=>new Response(JSON.stringify(v),{status:200});
const yt={access_token:"access",refresh_token:"refresh",expires_in:3600,token_type:"Bearer",scope:"https://www.googleapis.com/auth/youtube.readonly"};
const tt={access_token:"access",refresh_token:"refresh",expires_in:3600,refresh_expires_in:86400,token_type:"Bearer",scope:"user.info.basic",open_id:"fake-open-id"};
test("explicit enablement and exact same-origin HTTPS redirect required",()=>{
 const env={SOCIAL_YOUTUBE_ENABLED:"true",SOCIAL_YOUTUBE_CLIENT_ID:"fake",SOCIAL_YOUTUBE_CLIENT_SECRET:"fake",SOCIAL_YOUTUBE_REDIRECT_URI:config("youtube").redirectUri};
 assert.ok(videoOAuthConfig(env,"youtube",origin));
 for(const redirect of [origin+"/api/reach/connections/tiktok/callback",origin+"/api/reach/connections/youtube/callback?x=1","https://evil.test/api/reach/connections/youtube/callback"])
  assert.equal(videoOAuthConfig({...env,SOCIAL_YOUTUBE_REDIRECT_URI:redirect},"youtube",origin),null);
 assert.equal(videoOAuthConfig({...env,SOCIAL_YOUTUBE_ENABLED:"false"},"youtube",origin),null);
});
test("official OAuth hosts, read-only scopes, no secret in browser URL, Google PKCE",()=>{
 const y=new URL(buildVideoAuthorizeUrl(config("youtube"),state,verifier));
 assert.equal(y.hostname,"accounts.google.com");
 assert.equal(y.searchParams.get("scope"),yt.scope);
 assert.equal(y.searchParams.get("code_challenge_method"),"S256");
 assert.equal(y.searchParams.get("access_type"),"offline");
 assert.equal(y.searchParams.has("client_secret"),false);
 assert.throws(()=>buildVideoAuthorizeUrl(config("youtube"),state));
 const t=new URL(buildVideoAuthorizeUrl(config("tiktok"),state));
 assert.equal(t.hostname,"www.tiktok.com");
 assert.equal(t.searchParams.get("scope"),"user.info.basic");
 assert.equal(t.searchParams.get("client_key"),"fake-client");
 assert.equal(t.searchParams.has("client_secret"),false);
 assert.throws(()=>buildVideoAuthorizeUrl(config("tiktok"),"short"));
});
test("token exchange and refresh use fixed server endpoints; scope escalation rejected",async()=>{
 const y=await exchangeVideoCode(config("youtube"),"code",verifier,async(url,init)=>{
  assert.equal(url,"https://oauth2.googleapis.com/token");
  assert.equal(init.method,"POST");assert.equal(init.redirect,"error");
  assert.equal(init.body.get("code_verifier"),verifier);return response(yt);
 });
 assert.equal(y.refreshToken,"refresh");
 const t=await exchangeVideoCode(config("tiktok"),"code",undefined,async(url,init)=>{
  assert.equal(url,"https://open.tiktokapis.com/v2/oauth/token/");
  assert.equal(init.body.get("client_key"),"fake-client");return response(tt);
 });
 const refreshed=await refreshVideoToken(config("tiktok"),t,async()=>response({...tt,refresh_token:"rotated"}));
 assert.equal(refreshed.refreshToken,"rotated");
 await assert.rejects(()=>refreshVideoToken(config("tiktok"),t,async()=>response({...tt,open_id:"other"})));
 await assert.rejects(()=>exchangeVideoCode(config("tiktok"),"code",undefined,async()=>response({...tt,scope:"user.info.basic,video.publish"})));
 await assert.rejects(()=>exchangeVideoCode(config("tiktok"),"code",undefined,async()=>response({...tt,scope:""})));
});
test("account discovery requires authoritative identity and complete channel list",async()=>{
 const y=await exchangeVideoCode(config("youtube"),"code",verifier,async()=>response(yt));
 const id="UC"+"a".repeat(22),items=[{id,snippet:{title:"Test channel"}}];
 assert.deepEqual(await discoverVideoAccounts(config("youtube"),y,async(url,init)=>{
  assert.match(url,/mine=true/);assert.equal(init.headers.Authorization,"Bearer access");return response({items});
 }),[{id,name:"Test channel"}]);
 await assert.rejects(()=>discoverVideoAccounts(config("youtube"),y,async()=>response({items,nextPageToken:"next"})));
 await assert.rejects(()=>discoverVideoAccounts(config("youtube"),y,async()=>response({items:[]})));
 const t=await exchangeVideoCode(config("tiktok"),"code",undefined,async()=>response(tt));
 const profile=open_id=>({error:{code:"ok"},data:{user:{open_id,display_name:"Test profile"}}});
 assert.deepEqual(await discoverVideoAccounts(config("tiktok"),t,async()=>response(profile(t.openId))),[{id:t.openId,name:"Test profile"}]);
 await assert.rejects(()=>discoverVideoAccounts(config("tiktok"),t,async()=>response(profile("wrong"))));
});
