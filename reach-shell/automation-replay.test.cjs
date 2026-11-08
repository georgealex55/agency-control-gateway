'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const block=html.slice(html.indexOf('function automationData(){'),html.indexOf('function automationsContent(){'));
assert.ok(block.startsWith('function automationData(){')&&block.includes('function simulateAutomation('));
const factory=new Function('state','demoRules','demoEvents','save',block+'return {simulateAutomation,automationData};');
const rules=[{id:'missed-call',event:'missed-call'},{id:'new-inquiry',event:'new-inquiry'},{id:'hours-check',event:'hours-check'}];
const events=[{id:'call-1',event:'missed-call',label:'Call'},{id:'conv-1',event:'new-inquiry',label:'Inquiry'},{id:'google-hours',event:'hours-check',label:'Hours'}];
function setup(){const state={tasks:[],automations:{enabled:{'missed-call':true,'new-inquiry':true,'hours-check':true},receipts:[],selectedEvent:'call-1'}};let writes=0;return {state,api:factory(state,rules,events,()=>writes++),writes:()=>writes};}
test('automation executes once and replays without duplicate tasks',()=>{const {state,api}=setup();assert.equal(api.simulateAutomation('missed-call','call-1').status,'created');assert.equal(api.simulateAutomation('missed-call','call-1').status,'duplicate');assert.equal(state.tasks.length,1);});
test('trimmed receipt history does not reopen an event',()=>{const {state,api}=setup();api.simulateAutomation('missed-call','call-1');state.automations.receipts=[];assert.equal(api.simulateAutomation('missed-call','call-1').status,'duplicate');assert.equal(state.tasks.length,1);});
test('legacy orphan task repairs receipt without duplicate',()=>{const {state,api}=setup();state.tasks.push({id:'automation-missed-call:call-1',text:'old',done:false});assert.equal(api.simulateAutomation('missed-call','call-1').status,'duplicate');assert.equal(state.automations.receipts.length,1);assert.equal(state.tasks.length,1);});
test('disabled and mismatched events never execute',()=>{const {state,api}=setup();state.automations.enabled['hours-check']=false;assert.equal(api.simulateAutomation('hours-check','google-hours').status,'disabled');assert.equal(api.simulateAutomation('missed-call','conv-1').status,'invalid');assert.equal(state.tasks.length,0);});
test('separate event creates its own receipt and task',()=>{const {state,api}=setup();assert.equal(api.simulateAutomation('missed-call','call-1').status,'created');assert.equal(api.simulateAutomation('new-inquiry','conv-1').status,'created');assert.equal(state.tasks.length,2);});
