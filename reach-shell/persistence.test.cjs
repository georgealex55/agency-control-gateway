/** Offline persisted-state regression; synthetic VM, not a real browser.
 * Run: node --test reach-shell/persistence.test.cjs
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
function boot(raw){
 const data=new Map(raw===undefined?[]:[['reach-demo-state',raw]]);
 const localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
 const nodes=new Map();
 const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',value:'',dataset:{},focus(){},click(){this.onclick?.()}});return nodes.get(id)},querySelectorAll:()=>[],onkeydown:null};
 const window={addEventListener(){}};
 const context=vm.createContext({document,window,location:{hash:''},localStorage,sessionStorage,structuredClone,console});
 vm.runInContext(script,context,{filename:'reach-shell/index.html'});
 return {state:vm.runInContext('state',context),context,data};
}
test('invalid root arrays fall back to seeded collections',()=>{
 const {state}=boot('[]');
 for(const key of ['tasks','calls','conversations','contacts','appointments'])assert.ok(Array.isArray(state[key]),key);
 assert.equal(state.business,'Demo Business');
});
test('malformed collections recover individually without discarding profile',()=>{
 const {state}=boot(JSON.stringify({business:'Custom Demo',tasks:null,calls:'invalid',conversations:{},contacts:false,appointments:7,presence:[]}));
 assert.equal(state.business,'Custom Demo');
 for(const key of ['tasks','calls','conversations','contacts','appointments'])assert.ok(Array.isArray(state[key]),key);
 assert.ok(state.presence&&typeof state.presence==='object'&&!Array.isArray(state.presence));
});
test('valid persisted task records remain intact',()=>{
 const {state}=boot(JSON.stringify({business:'Retained',tasks:[{id:99,text:'Keep me',done:false}]}));
 assert.equal(state.business,'Retained');
 assert.equal(state.tasks.length,1);
 assert.equal(state.tasks[0].text,'Keep me');
});

test('legacy v1 records migrate to schema v2 without losing custom business data',()=>{
 const {state,context,data}=boot(JSON.stringify({business:'Retained Business',tasks:[{id:77,text:'Legacy task',done:false}],contacts:[{id:'legacy-contact',name:'Legacy Person'}],range:'30 days'}));
 assert.equal(state.__schemaVersion,2);
 assert.equal(state.business,'Retained Business');
 assert.equal(state.tasks[0].id,77);
 assert.equal(state.contacts[0].name,'Legacy Person');
 assert.equal(state.range,'30 days');
 vm.runInContext('save()',context);
 const saved=JSON.parse(data.get('reach-demo-state'));
 assert.equal(saved.__schemaVersion,2);
 assert.equal(saved.tasks[0].id,77);
});
test('versioned store sanitizes malformed collection members and invalid business profile',()=>{
 const {state}=boot(JSON.stringify({__schemaVersion:2,business:42,calls:[null,1,{id:'call-ok',name:'Valid'}],appointments:'bad'}));
 assert.equal(state.business,'Demo Business');
 assert.equal(state.calls.length,1);
 assert.equal(state.calls[0].id,'call-ok');
 assert.ok(Array.isArray(state.appointments));
});
test('repository reset clears legacy records and seeds a versioned offline state',()=>{
 const {context,data}=boot(JSON.stringify({business:'Old Profile',tasks:[{id:88,text:'Old',done:false}]}));
 vm.runInContext('resetDemoState()',context);
 const saved=JSON.parse(data.get('reach-demo-state'));
 assert.equal(saved.__schemaVersion,2);
 assert.equal(saved.business,'Demo Business');
 assert.equal(saved.tasks.some(x=>x.id===88),false);
});

test('missed-call callback links existing contact and never duplicates on repeated toggles',()=>{
 const {context,data}=boot(null);
 vm.runInContext("reconcileCallback(callsData().find(c=>c.id==='call-1'));save()",context);
 let saved=JSON.parse(data.get('reach-demo-state'));
 assert.equal(saved.tasks.filter(t=>t.sourceCallId==='call-1').length,1);
 assert.equal(saved.tasks.find(t=>t.sourceCallId==='call-1').contactId,'contact-1');
 assert.equal(saved.calls.find(c=>c.id==='call-1').followUp,true);
 vm.runInContext("reconcileCallback(callsData().find(c=>c.id==='call-1'));reconcileCallback(callsData().find(c=>c.id==='call-1'));save()",context);
 saved=JSON.parse(data.get('reach-demo-state'));
 assert.equal(saved.tasks.filter(t=>t.sourceCallId==='call-1').length,1);
 assert.equal(saved.tasks.find(t=>t.sourceCallId==='call-1').done,false);
});
test('callback reuses a legacy task and does not link unrelated contact',()=>{
 const {context,data}=boot(JSON.stringify({tasks:[{id:'callback-call-3',text:'Old callback',done:true}]}));
 vm.runInContext("reconcileCallback(callsData().find(c=>c.id==='call-3'));save()",context);
 const saved=JSON.parse(data.get('reach-demo-state'));
 const task=saved.tasks.find(t=>t.id==='callback-call-3');
 assert.equal(saved.tasks.filter(t=>t.id==='callback-call-3').length,1);
 assert.equal(task.done,false);
 assert.equal(task.contactId,'contact-3');
});
