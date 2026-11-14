'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {newSessionStore}=require('../auth/session.cjs');
const {createContactApi}=require('./contacts.cjs');
function fixture(){
 const sessions=newSessionStore(),owner=sessions.issue({userId:'owner-a',tenantId:'tenant-a',role:'owner'});
 const calls=[],db={query:async(sql,params)=>{calls.push({sql,params});return {rows:[{id:'c1',display_name:'Synthetic Contact'}]}}};
 return {sessions,owner,calls,api:createContactApi({sessions,db})};
}
test('missing or forged session denied without database access',async()=>{
 const f=fixture();
 assert.equal((await f.api.handle({method:'GET',tenantId:'tenant-a'})).status,401);
 assert.equal((await f.api.handle({method:'GET',tenantId:'tenant-a',token:'demo@reach.local'})).status,401);
 assert.equal(f.calls.length,0);
});
test('authenticated owner may read only own tenant records',async()=>{
 const f=fixture();
 const ok=await f.api.handle({method:'GET',tenantId:'tenant-a',token:f.owner.token,contactId:'c1'});
 assert.equal(ok.status,200);assert.equal(ok.body.source,'STAGING_SYNTHETIC');
 assert.deepEqual(f.calls[0].params,['tenant-a','c1']);
 assert.equal((await f.api.handle({method:'GET',tenantId:'tenant-b',token:f.owner.token})).status,403);
 assert.equal(f.calls.length,1);
});
test('writes require CSRF and strict validated synthetic payload',async()=>{
 const f=fixture(),req={method:'POST',tenantId:'tenant-a',token:f.owner.token,body:{id:'c1',displayName:'Synthetic Contact'}};
 assert.equal((await f.api.handle(req)).status,403);
 assert.equal((await f.api.handle({...req,csrf:f.owner.csrf,body:{...req.body,tenantId:'tenant-b'}})).status,400);
 assert.equal((await f.api.handle({...req,csrf:f.owner.csrf,body:{...req.body,email:42}})).status,400);
 assert.equal((await f.api.handle({...req,csrf:f.owner.csrf})).status,201);
 assert.deepEqual(f.calls[0].params,['tenant-a','c1','Synthetic Contact',null,null]);
});
test('storage errors are redacted and duplicates are conflict',async()=>{
 const sessions=newSessionStore(),owner=sessions.issue({userId:'owner-a',tenantId:'tenant-a',role:'owner'});
 const req={method:'GET',token:owner.token,tenantId:'tenant-a'};
 let api=createContactApi({sessions,db:{query:async()=>{throw Object.assign(new Error('SECRET DATABASE URL'),{code:'23505'})}}});
 assert.equal((await api.handle(req)).status,409);
 api=createContactApi({sessions,db:{query:async()=>{throw Error('SECRET DATABASE URL')}}});
 const response=await api.handle(req);assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(response),/SECRET/);
});
