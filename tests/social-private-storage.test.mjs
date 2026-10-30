import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {mediaStorageStatus,uploadAllowed} from "../ghl-gpt-gateway/lib/social-media-contract.ts";
import {encryptMetaToken,decryptMetaToken,signMetaConsent,verifyMetaConsent} from "../ghl-gpt-gateway/lib/social-meta-crypto.ts";
const store="store_gzljSQEomfAWWROP";
const owner="8bba25e1-dc8e-4601-8bf2-91092f097bcc",other="bccf663f-097d-4324-a155-963b08eadb30";
test("private Blob requires correct store ID, branch gate and explicit opt-in",()=>{
 const base={SOCIAL_MEDIA_STAGING_STORE_ID:store,BLOB_STORE_ID:store,VERCEL_OIDC_TOKEN:"mock-oidc",SOCIAL_MEDIA_UPLOADS_ENABLED:"false"};
 assert.equal(mediaStorageStatus(base).mode,"oidc");
 assert.equal(mediaStorageStatus(base).readAllowed,true);
 assert.equal(uploadAllowed(base),false);
 assert.equal(uploadAllowed({...base,SOCIAL_MEDIA_UPLOADS_ENABLED:"true"}),true);
 assert.equal(uploadAllowed({...base,BLOB_STORE_ID:"store_bad",SOCIAL_MEDIA_UPLOADS_ENABLED:"true"}),false);
 assert.equal(uploadAllowed({...base,VERCEL_OIDC_TOKEN:"",SOCIAL_MEDIA_UPLOADS_ENABLED:"true"}),false);
 assert.equal(mediaStorageStatus({...base,BLOB_STORE_ID:"store_bad"}).reason,"wrong-store");
 assert.equal(mediaStorageStatus({...base,BLOB_READ_WRITE_TOKEN:"fallback",VERCEL_OIDC_TOKEN:""}).mode,"token");
});
test("Meta token envelope cryptographically binds account and workspace",()=>{
 const key=randomBytes(32).toString("base64url"),token="META_TEST_DO_NOT_CONNECT";
 const secret=encryptMetaToken(token,key,owner,"facebook_pages","123456789012");
 assert.equal(decryptMetaToken(secret,key,owner,"facebook_pages","123456789012"),token);
 assert(!secret.includes(token));
 assert.throws(()=>decryptMetaToken(secret,key,other,"facebook_pages","123456789012"));
 assert.throws(()=>decryptMetaToken(secret,key,owner,"instagram_professional","123456789012"));
 assert.throws(()=>decryptMetaToken(secret,randomBytes(32).toString("base64url"),owner,"facebook_pages","123456789012"));
});
test("consent state is time-limited, signed and cannot be retargeted",()=>{
 const secret=randomBytes(48).toString("base64url"),now=Date.now(),state=signMetaConsent({workspaceId:owner,provider:"instagram_professional",expires:now+180000,nonce:randomBytes(24).toString("base64url")},secret);
 const verified=verifyMetaConsent(state,secret,now);
 assert.equal(verified?.workspaceId,owner);
 assert.equal(verified?.provider,"instagram_professional");
 assert.equal(verifyMetaConsent(state,secret,now+180001),null);
 assert.equal(verifyMetaConsent(state,randomBytes(48).toString("base64url"),now),null);
 assert.equal(verifyMetaConsent(state.replace(/.$/,"A"),secret,now),null);
});
