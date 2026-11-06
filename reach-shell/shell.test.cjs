/** Offline shell smoke checks: node --test reach-shell/shell.test.cjs */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
function harness(){
 const nodes=new Map(), storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
 const localStorage=storage(),sessionStorage=storage(),location={hash:''};
 const element=id=>{if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',value:'Demo Business',dataset:{},focus(){this.focused=true},click(){this.onclick?.()},onclick:null});return nodes.get(id)};
 const document={getElementById:element,querySelectorAll:()=>[],onkeydown:null};
 const listeners={};const window={addEventListener:(name,fn)=>listeners[name]=fn};
 const context=vm.createContext({document,window,localStorage,sessionStorage,location,structuredClone,console});
 vm.runInContext(script,context,{filename:'reach-shell/index.html'});
 return {context,element,location,listeners,document,sessionStorage};
}
test('source is runnable and contains eleven destinations',()=>{
 assert.ok(script);
 const h=harness();assert.match(h.element('app').innerHTML,/Enter demo dashboard/);
 const routes=vm.runInContext('pages.map(p=>p[0])',h.context);
 assert.equal(routes.length,11);assert.equal(new Set(routes).size,11);
});
test('demo login and logout change view and session',()=>{
 const h=harness();h.element('business').value='Synthetic Owner';
 h.element('enter').click();
 assert.equal(h.sessionStorage.getItem('reach-demo-login'),'yes');
 assert.match(h.element('app').innerHTML,/Synthetic Owner/);
 h.element('logout').click();assert.equal(h.sessionStorage.getItem('reach-demo-login'),null);
 assert.match(h.element('app').innerHTML,/Enter demo dashboard/);
});
test('each hash destination renders its corresponding heading',()=>{
 const h=harness();h.element('enter').click();
 const pages=vm.runInContext('pages',h.context);
 for(const [route,label] of pages){
   h.location.hash='#/'+route;h.listeners.hashchange();
   assert.match(h.element('app').innerHTML,new RegExp('<h1>'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'</h1>'));
 }
});
test('keyboard enter submits login',()=>{
 const h=harness();h.element('business').value='Keyboard Owner';
 h.element('business').onkeydown({key:'Enter'});
 assert.match(h.element('app').innerHTML,/Keyboard Owner/);
});
test('mobile toggle changes expanded state; Escape closes it',()=>{
 const h=harness();h.element('enter').click();
 h.element('navToggle').click();
 assert.match(h.element('app').innerHTML,/aria-expanded="true"/);
 h.document.onkeydown({key:'Escape'});
 assert.match(h.element('app').innerHTML,/aria-expanded="false"/);
});
test('demo route names and disabled integrations are clearly labeled',()=>{
 const h=harness();h.element('enter').click();
 assert.match(h.element('app').innerHTML,/DEMO DATA · OFFLINE/);
 h.location.hash='#/calls';h.listeners.hashchange();
 assert.match(h.element('app').innerHTML,/Not connected to external services/);
});

test('dashboard period selection updates sample metrics and local state',()=>{
 const h=harness();h.element('enter').click();
 assert.match(h.element('app').innerHTML,/Sample reporting period/);
 assert.match(h.element('app').innerHTML,/Sample calls · 2 missed/);
 h.element('dashboardRange').value='30 days';h.element('dashboardRange').onchange();
 assert.match(h.element('app').innerHTML,/Sample calls · 8 missed/);
 assert.equal(vm.runInContext('state.range',h.context),'30 days');
});
test('dashboard drilldown explains source and can be closed',()=>{
 const h=harness();h.element('enter').click();
 vm.runInContext("state.detail='calls';save();render()",h.context);
 assert.match(h.element('app').innerHTML,/49|12 simulated calls/);
 assert.match(h.element('app').innerHTML,/No phone provider connected/);
 h.element('closeDetail').click();
 assert.doesNotMatch(h.element('app').innerHTML,/No phone provider connected/);
});

test('inbox exposes seeded conversations, search and demo-only reply actions',()=>{
 const h=harness();h.element('enter').click();h.location.hash='#/inbox';h.listeners.hashchange();
 assert.match(h.element('app').innerHTML,/Jordan Lee/);
 assert.match(h.element('app').innerHTML,/Search conversations/);
 assert.match(h.element('app').innerHTML,/Simulate reply \(not sent\)/);
 assert.match(h.element('app').innerHTML,/Nothing is connected or delivered/);
});
test('inbox saves draft and simulates outbound reply without provider delivery',()=>{
 const h=harness();h.element('enter').click();h.location.hash='#/inbox';h.listeners.hashchange();
 h.element('replyDraft').value='Demo response';
 h.element('saveDraft').click();
 assert.equal(vm.runInContext("state.conversations[0].draft",h.context),'Demo response');
 h.element('replyDraft').value='Demo response';
 h.element('simulateReply').click();
 assert.equal(vm.runInContext("state.conversations[0].messages.at(-1).status",h.context),'simulated · not delivered');
 assert.match(h.element('app').innerHTML,/Demo response/);
});

test('calls screen displays synthetic history, filters and demo policy',()=>{
 const h=harness();h.element('enter').click();h.location.hash='#/calls';h.listeners.hashchange();
 assert.match(h.element('app').innerHTML,/Call history · Synthetic/);
 assert.match(h.element('app').innerHTML,/Jordan Lee/);
 assert.match(h.element('app').innerHTML,/No telephone account/);
 h.element('callFilter').value='Missed';h.element('callFilter').onchange();
 assert.equal(vm.runInContext('state.callFilter',h.context),'Missed');
 h.element('callPolicy').value='callback';h.element('callPolicy').onchange();
 assert.equal(vm.runInContext('state.callPolicy',h.context),'callback');
 assert.match(h.element('app').innerHTML,/Create callback task/);
});
test('missed call callback creates durable dashboard task and can be resolved',()=>{
 const h=harness();h.element('enter').click();h.location.hash='#/calls';h.listeners.hashchange();
 vm.runInContext("const c=callsData()[0];c.followUp=true;state.tasks.push({id:'callback-'+c.id,text:'Call back '+c.name,done:false});save();render()",h.context);
 assert.equal(vm.runInContext("state.calls[0].followUp",h.context),true);
 h.location.hash='#/dashboard';h.listeners.hashchange();
 assert.match(h.element('app').innerHTML,/Call back Jordan Lee/);
 assert.match(h.element('app').innerHTML,/data-task="callback-call-1"/);
 vm.runInContext("const t=state.tasks.find(t=>t.id==='callback-call-1');t.done=true;save();render()",h.context);
 assert.equal(vm.runInContext("state.tasks.find(t=>t.id==='callback-call-1').done",h.context),true);
});

test('business presence exposes explicitly synthetic website and Google status',()=>{
 const h=harness();h.element('enter').click();h.location.hash='#/presence';h.listeners.hashchange();
 assert.match(h.element('app').innerHTML,/Website · Sample status/);
 assert.match(h.element('app').innerHTML,/example.invalid/);
 assert.match(h.element('app').innerHTML,/Not connected to Google/);
 assert.match(h.element('app').innerHTML,/Hours discrepancy/);
 h.element('websiteDetails').click();
 assert.match(h.element('app').innerHTML,/fictional fixtures/);
 assert.equal(vm.runInContext('state.presence.websiteDetails',h.context),true);
});
test('Google sample discrepancy creates and removes local dashboard task',()=>{
 const h=harness();h.element('enter').click();h.location.hash='#/presence';h.listeners.hashchange();
 h.element('presenceTask').click();
 assert.equal(vm.runInContext('state.presence.fixTaskCreated',h.context),true);
 assert.equal(vm.runInContext("state.tasks.some(t=>t.id==='presence-google-hours')",h.context),true);
 h.location.hash='#/dashboard';h.listeners.hashchange();
 assert.match(h.element('app').innerHTML,/Review sample Google listing hours/);
 h.location.hash='#/presence';h.listeners.hashchange();
 h.element('presenceTask').click();
 assert.equal(vm.runInContext("state.tasks.some(t=>t.id==='presence-google-hours')",h.context),false);
});

test('appointments screen renders seeded synthetic record and editable form',()=>{
 const h=harness();h.element('enter').onclick();h.location.hash='#/appointments';h.listeners.hashchange();
 const html=h.element('app').innerHTML;
 assert.match(html,/Create sample appointment/);
 assert.match(html,/Morgan Chen/);
 assert.match(html,/appointmentForm/);
 assert.match(html,/data-appointment-toggle/);
});
test('appointment state persists and supports cancellation and rescheduling',()=>{
 const h=harness();h.element('enter').onclick();h.location.hash='#/appointments';h.listeners.hashchange();
 vm.runInContext("appointmentsData()[0].when='2026-11-10T11:45';appointmentsData()[0].status='Cancelled';save();render()",h.context);
 const persisted=vm.runInContext("JSON.parse(localStorage.getItem('reach-demo-state')).appointments[0]",h.context);
 assert.equal(persisted.when,'2026-11-10T11:45');
 assert.equal(persisted.status,'Cancelled');
 assert.match(h.element('app').innerHTML,/Restore/);
});
