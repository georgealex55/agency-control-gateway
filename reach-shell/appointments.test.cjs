'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function boot(){
 const storage=new Map();
 const context={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem:()=>null},structuredClone,Date,Math,console,location:{hash:'#/appointments'},window:{addEventListener:()=>{}},document:{getElementById:()=>({innerHTML:'',addEventListener:()=>{}}),querySelectorAll:()=>[]}};
 vm.createContext(context);
 vm.runInContext(script.replace(/render\(\);\s*$/,''),context);
 return context;
}
test('appointment links only uniquely resolved conversation contact',()=>{
 const c=boot();
 vm.runInContext("var a={id:'appt-x',name:'Jordan Lee',service:'Review',when:'2026-11-10T12:00',conversationId:'conv-1',status:'Scheduled'};state.appointments.push(a);a.contactId=contactForAppointment(a)?.id||null;reconcileAppointmentTask(a)",c);
 assert.equal(vm.runInContext("a.contactId",c),'contact-1');
 assert.equal(vm.runInContext("state.tasks.filter(t=>t.sourceAppointmentId==='appt-x').length",c),1);
 assert.match(vm.runInContext("conversationTimeline(inboxData()[0]).entries.map(x=>x.type).join(',')",c),/appointment/);
});
test('rescheduling and cancellation reuse task id and retain audit record',()=>{
 const c=boot();
 vm.runInContext("var a={id:'appt-x',name:'Jordan Lee',service:'Review',when:'2026-11-10T12:00',conversationId:'conv-1',status:'Scheduled'};state.appointments.push(a);reconcileAppointmentTask(a);a.when='2026-11-11T12:00';reconcileAppointmentTask(a);a.status='Cancelled';reconcileAppointmentTask(a)",c);
 assert.equal(vm.runInContext("state.tasks.filter(t=>t.sourceAppointmentId==='appt-x').length",c),1);
 assert.equal(vm.runInContext("state.tasks.find(t=>t.sourceAppointmentId==='appt-x').done",c),true);
});
test('explicit conversation match wins over unrelated duplicate contact name',()=>{
 const c=boot();
 vm.runInContext("state.contacts.push({...state.contacts[0],id:'duplicate',conversationId:null});var a={id:'appt-x',name:'Jordan Lee',conversationId:'conv-1',status:'Scheduled',service:'Review'};a.contactId=contactForAppointment(a)?.id||null;reconcileAppointmentTask(a)",c);
 assert.equal(vm.runInContext("a.contactId",c),'contact-1');
});
