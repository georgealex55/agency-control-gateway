'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const section=script.slice(script.indexOf('// Reports derive from stored synthetic records'),script.indexOf('const assistantCommands='));
function run(calls,inbox,appointments){
 const ctx={state:{report:{range:'90 days',source:'all'}},callsData:()=>calls,inboxData:()=>inbox,appointmentsData:()=>appointments,card:(t,b)=>t+b,esc:String};
 vm.createContext(ctx);vm.runInContext(section,ctx);
 return {counts:JSON.parse(JSON.stringify(vm.runInContext('reportSnapshot()',ctx))),html:vm.runInContext('metricsContent()',ctx)};
}
test('report derives call, inbox and appointment counts from stored records',()=>{
 const r=run([{kind:'Missed'},{kind:'Answered'}],[{unread:true},{unread:false}],[{status:'Cancelled'}]);
 assert.deepEqual(r.counts,{calls:2,missed:1,inbox:2,unread:1,appointments:1,cancelled:1});
 assert.match(r.html,/selected period is not applied/);
});
test('report recalculates zero counts and does not use static snapshots',()=>{
 const r=run([],[],[]);assert.equal(r.counts.calls,0);assert.equal(r.counts.inbox,0);assert.equal(r.counts.appointments,0);
 assert.doesNotMatch(r.html,/49|144/);
});
