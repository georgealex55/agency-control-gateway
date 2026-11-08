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
 return vm.runInContext('state',context);
}
test('invalid root arrays fall back to seeded collections',()=>{
 const state=boot('[]');
 for(const key of ['tasks','calls','conversations','contacts','appointments'])assert.ok(Array.isArray(state[key]),key);
 assert.equal(state.business,'Demo Business');
});
test('malformed collections recover individually without discarding profile',()=>{
 const state=boot(JSON.stringify({business:'Custom Demo',tasks:null,calls:'invalid',conversations:{},contacts:false,appointments:7,presence:[]}));
 assert.equal(state.business,'Custom Demo');
 for(const key of ['tasks','calls','conversations','contacts','appointments'])assert.ok(Array.isArray(state[key]),key);
 assert.ok(state.presence&&typeof state.presence==='object'&&!Array.isArray(state.presence));
});
test('valid persisted task records remain intact',()=>{
 const state=boot(JSON.stringify({business:'Retained',tasks:[{id:99,text:'Keep me',done:false}]}));
 assert.equal(state.business,'Retained');
 assert.equal(state.tasks.length,1);
 assert.equal(state.tasks[0].text,'Keep me');
});
