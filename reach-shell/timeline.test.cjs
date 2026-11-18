'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function boot(){
 const storage=new Map(),ctx={structuredClone,location:{hash:'#/inbox'},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem:()=>null},window:{addEventListener(){}},document:{getElementById:()=>({innerHTML:'',value:''}),querySelectorAll:()=>[]}};
 vm.createContext(ctx);vm.runInContext(script,ctx);return ctx;
}
test('selected inbox timeline links call and callback task',()=>{
 const ctx=boot();vm.runInContext('reconcileCallback(callsData()[0])',ctx);
 const result=vm.runInContext('conversationTimeline(inboxData()[0])',ctx);
 assert.equal(result.contact.id,'contact-1');
 assert.equal(result.entries.filter(x=>x.type==='call').length,1);
 assert.equal(result.entries.filter(x=>x.type==='task').length,1);
 assert.match(vm.runInContext('inboxContent()',ctx),/Customer activity · Offline sample/);
});
test('ambiguous names never link unrelated contact data',()=>{
 const ctx=boot();vm.runInContext("state.contacts=[{id:'a',name:'Jordan Lee'},{id:'b',name:'Jordan Lee'}];inboxData()[0].id='unlinked'",ctx);
 const result=vm.runInContext('conversationTimeline(inboxData()[0])',ctx);
 assert.equal(result.contact,null);assert.equal(result.entries.filter(x=>x.type!=='message').length,0);
});
test('simulated reply appears as timeline event',()=>{
 const ctx=boot();vm.runInContext("inboxData()[0].messages.push({direction:'out',text:'Sample only',at:'Demo now',status:'simulated · not delivered'})",ctx);
 assert.ok(vm.runInContext('conversationTimeline(inboxData()[0])',ctx).entries.some(x=>x.label.includes('Simulated reply · Sample only')));
});
