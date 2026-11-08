'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\\/script>/)[1];
function boot(){
 const storage=new Map();
 const context={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem:()=>null},structuredClone,Date,Math,console,location:{hash:'#/dashboard'},window:{addEventListener:()=>{}},document:{getElementById:()=>({innerHTML:'',addEventListener:()=>{}}),querySelectorAll:()=>[]}};
 vm.createContext(context);
 vm.runInContext(script.replace(/render\(\);\s*$/,''),context);
 return context;
}
test('dashboard derives counts from stored sample collections',()=>{
 const c=boot();
 const initial=vm.runInContext('dashboardSummary()',c);
 assert.equal(initial.calls,3);
 assert.equal(initial.missed,2);
 assert.equal(initial.inbox,3);
 assert.equal(initial.unread,2);
 vm.runInContext("state.calls.push({id:'call-added',kind:'Missed'});state.conversations[0].unread=false;state.tasks.push({id:'followup-added',sourceCallId:'call-added',done:false,text:'Callback'})",c);
 const next=vm.runInContext('dashboardSummary()',c);
 assert.equal(next.calls,4);assert.equal(next.missed,3);assert.equal(next.unread,1);assert.equal(next.callbackOpen,1);
});
test('resolving task and presence issue updates summary without touching fixture reports',()=>{
 const c=boot();
 vm.runInContext("state.tasks[0].done=true;state.presence.googleHoursMismatch=false",c);
 const v=vm.runInContext('dashboardSummary()',c);
 assert.equal(v.openTasks,1);assert.equal(v.healthHealthy,4);
});
test('dashboard explicitly avoids false period filtering of undated demo fixtures',()=>{
 const c=boot();
 vm.runInContext("state.range='90 days'",c);
 const first=vm.runInContext('dashboardSummary().calls',c);
 vm.runInContext("state.range='7 days'",c);
 assert.equal(vm.runInContext('dashboardSummary().calls',c),first);
 assert.match(vm.runInContext("content('dashboard')",c),/not date-filtered/);
});
