/** Offline 24-function/11-route smoke audit. Run: node --test reach-shell/acceptance.test.cjs
 * Uses a synthetic DOM/event harness, not an independent real browser.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)?.[1];
test('24 functional interactions and 11 routes work in isolated demo shell',()=>{
 assert.ok(script);
 const elements=new Map(),listeners={},location={hash:''},clone=v=>JSON.parse(JSON.stringify(v));
 const storage=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
 const localStorage=storage(),sessionStorage=storage();let markup='';
 const appElement={get innerHTML(){return markup},set innerHTML(v){markup=v;elements.clear()}};
 const document={
  getElementById(id){
   if(id==='app')return appElement;
   if(!elements.has(id)){
    const tag=markup.match(new RegExp('<[^>]*id="'+id+'"[^>]*>'))?.[0]||'';
    const val=tag.match(/ value="([^"]*)"/)?.[1]||(id==='business'?'Demo Business':'');
    elements.set(id,{value:val,checked:false,dataset:{},textContent:'',focus(){},click(){this.onclick?.()}});
   }
   return elements.get(id);
  },
  querySelectorAll(selector){
   const attr=selector.match(/^\[data-([a-z-]+)\]$/)?.[1];if(!attr)return [];
   const matches=[],regex=new RegExp('<[^>]*data-'+attr+'="([^"]+)"[^>]*>','g');
   for(const m of markup.matchAll(regex)){
    const node=this.getElementById('data:'+attr+':'+m[1]);
    node.dataset[attr.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=m[1];
    node.checked=/\schecked(?:\s|>|=)/.test(m[0]);matches.push(node);
   }
   return matches;
  },onkeydown:null
 };
 const window={addEventListener:(key,fn)=>listeners[key]=fn};
 const instance=new Function('document','window','location','localStorage','sessionStorage','structuredClone','console',script+'\nreturn {get state(){return state},pages,read,esc};')
  (document,window,location,localStorage,sessionStorage,clone,console);
 const el=id=>document.getElementById(id),go=id=>{location.hash='#/'+id;listeners.hashchange()};
 const dyn=(attr,value)=>{
  const key=attr.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
  const item=document.querySelectorAll('[data-'+attr+']').find(n=>n.dataset[key]===value);
  assert.ok(item,'missing clickable '+attr+':'+value);return item;
 };
 const set=fields=>Object.entries(fields).forEach(([id,value])=>el(id).value=value);
 const submit=id=>el(id).onsubmit({preventDefault(){}});
 let passed=0;
 const check=(number,name,fn)=>{try{fn();passed++}catch(error){error.message='Action #'+number+' '+name+': '+error.message;throw error}};
 check(1,'login',()=>{el('demoEmail').value='wrong@example.invalid';el('demoPassword').value='bad';el('enter').click();assert.equal(sessionStorage.getItem('reach-demo-login'),null);el('fillDemo').click();el('enter').click();assert.equal(sessionStorage.getItem('reach-demo-login'),'yes')});
 check(2,'logout',()=>{el('logout').click();assert.equal(sessionStorage.getItem('reach-demo-login'),null);el('fillDemo').click();el('enter').click()});
 check(3,'setup progress',()=>{go('setup');const n=dyn('setup-step','review');n.checked=true;n.onchange();assert.ok(instance.state.setup.completed.includes('review'))});
 check(4,'business profile persistence',()=>{go('connections');el('setupProfile').value='sample-service';el('setupProfile').onchange();assert.equal(instance.read().setup.profile,'sample-service')});
 check(5,'dashboard range',()=>{go('dashboard');el('dashboardRange').value='30 days';el('dashboardRange').onchange();assert.equal(instance.state.range,'30 days')});
 check(6,'dashboard drilldown',()=>{dyn('detail','calls').click();assert.match(markup,/Calls overview/);el('closeDetail').click();assert.doesNotMatch(markup,/<h3>Calls overview/)});
 check(7,'dashboard task',()=>{dyn('task','1').click();assert.equal(instance.state.tasks.find(t=>t.id===1).done,true)});
 check(8,'conversation select',()=>{go('inbox');dyn('conversation','conv-2').click();assert.equal(instance.state.selectedConversation,'conv-2')});
 check(9,'draft and simulated reply',()=>{el('replyDraft').value='Draft';el('saveDraft').click();assert.equal(instance.state.conversations[1].draft,'Draft');el('replyDraft').value='Sample reply';el('simulateReply').click();assert.match(instance.state.conversations[1].messages.at(-1).status,/not delivered/)});
 check(10,'inbox filters',()=>{el('inboxSearch').value='Jordan';el('inboxSearch').oninput();el('inboxFilter').value='unread';el('inboxFilter').onchange();assert.equal(instance.state.inboxSearch,'Jordan');assert.equal(instance.state.inboxFilter,'unread')});
 check(11,'call search/filter',()=>{go('calls');el('callSearch').value='Taylor';el('callSearch').oninput();el('callFilter').value='Missed';el('callFilter').onchange();assert.equal(instance.state.callSearch,'Taylor');assert.equal(instance.state.callFilter,'Missed')});
 check(12,'callback follow-up',()=>{dyn('call-followup','call-3').click();assert.ok(instance.state.tasks.some(t=>t.id==='callback-call-3'))});
 check(13,'call fallback policy',()=>{el('callPolicy').value='callback';el('callPolicy').onchange();assert.equal(instance.state.callPolicy,'callback')});
 check(14,'website details',()=>{go('presence');el('websiteDetails').click();assert.equal(instance.state.presence.websiteDetails,true)});
 check(15,'Google hours task',()=>{el('presenceTask').click();assert.ok(instance.state.tasks.some(t=>t.id==='presence-google-hours'))});
 check(16,'appointment creation',()=>{go('appointments');set({appointmentName:'Jamie Doe',appointmentWhen:'2026-11-12T11:30',appointmentService:'Call',appointmentConversation:'conv-1'});submit('appointmentForm');assert.ok(instance.state.appointments.some(a=>a.name==='Jamie Doe'))});
 check(17,'appointment reschedule/cancel',()=>{dyn('appointment-edit','appt-demo-1').click();set({appointmentName:'Morgan Chen',appointmentWhen:'2026-11-13T12:45',appointmentService:'Consultation',appointmentConversation:'conv-2'});submit('appointmentForm');dyn('appointment-toggle','appt-demo-1').click();assert.equal(instance.state.appointments.find(a=>a.id==='appt-demo-1').status,'Cancelled')});
 check(18,'contact create/edit',()=>{go('contacts');set({contactName:'Demo Client',contactEmail:'demo@example.invalid',contactPhone:'5550000',contactNotes:'Test',contactConversation:'conv-1',contactCall:'call-1'});submit('contactForm');const c=instance.state.contacts.find(c=>c.name==='Demo Client');assert.ok(c);dyn('contact-edit',c.id).click();set({contactName:'Edited Client',contactEmail:'demo@example.invalid',contactPhone:'5550000',contactNotes:'Updated',contactConversation:'conv-1',contactCall:'call-1'});submit('contactForm');assert.ok(instance.state.contacts.some(c=>c.name==='Edited Client'))});
 check(19,'contact search',()=>{el('contactSearch').value='Edited';el('contactSearch').oninput();assert.match(markup,/1 matching local contacts/)});
 check(20,'automation toggle/receipt',()=>{go('automations');let n=dyn('rule-toggle','missed-call');n.checked=false;n.onchange();assert.equal(instance.state.automations.enabled['missed-call'],false);n=dyn('rule-toggle','missed-call');n.checked=true;n.onchange();el('automationRun').click();assert.equal(instance.state.automations.receipts.length,1)});
 check(21,'reports range/source',()=>{go('metrics');el('reportRange').value='90 days';el('reportRange').onchange();el('reportSource').value='calls';el('reportSource').onchange();assert.equal(instance.state.report.range,'90 days');assert.equal(instance.state.report.source,'calls')});
 check(22,'assistant action',()=>{go('assistant');el('assistantCommand').value='task';el('assistantExecute').click();assert.ok(instance.state.tasks.some(t=>t.text==='Review sample business health'))});
 check(23,'connections walkthrough',()=>{go('connections');assert.match(markup,/Not connected/);assert.match(markup,/Customer-owned Neon/);go('setup');assert.match(markup,/First-time setup checklist/)});
 check(24,'export/reset',()=>{go('connections');el('exportDemo').click();assert.match(markup,/Synthetic JSON export/);el('armReset').click();el('confirmReset').click();assert.equal(instance.state.business,'Demo Business');assert.equal(instance.state.tasks.length,2)});
 let routes=0;
 for(const [key,label] of instance.pages){go(key);assert.ok(markup.includes('<h1>'+instance.esc(label)+'</h1>'),'route '+key);routes++}
 assert.equal(routes,12);assert.equal(passed,24);
});
