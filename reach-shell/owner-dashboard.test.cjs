'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const shell=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const mirror=fs.readFileSync(path.join(__dirname,'../ghl-gpt-gateway/public/reach-demo/index.html'),'utf8');
const script=shell.match(/<script>([\s\S]*?)<\/script>/)?.[1];
function boot(){
 const store=new Map();
 const c={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},sessionStorage:{getItem:()=>null},structuredClone,Date,Math,console,location:{hash:'#/dashboard'},window:{addEventListener:()=>{}},document:{getElementById:()=>({innerHTML:'',addEventListener:()=>{}}),querySelectorAll:()=>[]}};
 vm.createContext(c);vm.runInContext(script.replace(/render\(\);\s*$/,''),c);return c;
}
test('offline demo and preview shell are byte identical',()=>assert.equal(shell,mirror));
test('owner dashboard combines opportunity value, appointments and local priority tasks',()=>{
 const c=boot(),html=vm.runInContext("content('dashboard')",c);
 assert.match(html,/Revenue opportunities · Illustrative/);
 assert.match(html,/Estimated recoverable value:/);
 assert.match(html,/Not actual revenue or live leads/);
 assert.match(html,/Appointments · Local demo/);
 assert.match(html,/Review opportunities and follow-ups/);
 assert.match(html,/Review appointments/);
 assert.match(html,/Priority Actions/);
});
test('dashboard appointment count reflects locally updated demo records',()=>{
 const c=boot();
 const before=vm.runInContext("content('dashboard')",c);
 vm.runInContext("state.appointments.push({id:'appt-local-extra',name:'Demo',status:'Scheduled',when:'2026-11-15T09:00'})",c);
 const after=vm.runInContext("content('dashboard')",c);
 assert.match(before,/Appointments · Local demo<\/h3><strong>1<\/strong>/);
 assert.match(after,/Appointments · Local demo<\/h3><strong>2<\/strong>/);
});

test('offline shell script parses and review tasks are owner-local, deduplicated and persisted',()=>{
 assert.doesNotThrow(()=>new Function(script));
 const c=boot();
 assert.match(vm.runInContext("opportunityContent()",c),/Create local review task/);
 const first=vm.runInContext("queueOpportunityReview('opp-quote-1')",c);
 assert.equal(first.status,'created');
 const second=vm.runInContext("queueOpportunityReview('opp-quote-1')",c);
 assert.equal(second.status,'duplicate');
 assert.equal(vm.runInContext("state.tasks.filter(t=>t.sourceOpportunityId==='opp-quote-1').length",c),1);
 assert.equal(vm.runInContext("JSON.parse(localStorage.getItem('reach-demo-state')).tasks.some(t=>t.sourceOpportunityId==='opp-quote-1')",c),true);
 assert.equal(vm.runInContext("queueOpportunityReview('missing-opportunity').status",c),'invalid');
 assert.match(vm.runInContext("state.tasks.find(t=>t.sourceOpportunityId==='opp-quote-1').text",c),/owner approval before contact/);
});
