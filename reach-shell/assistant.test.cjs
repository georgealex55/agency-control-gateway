'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
test('assistant inline script compiles',()=>assert.doesNotThrow(()=>new vm.Script(script)));
test('assistant parser only allows known local commands',()=>{
 const source=script.slice(script.indexOf('function parseAssistantIntent('),script.indexOf('\nfunction assistantContent('));
 const parse=vm.runInNewContext(source+';parseAssistantIntent');
 for(const [input,expected] of [["review missed calls","missed"],["check business hours","hours"],["open inbox","inbox"],["create business review task","task"],["send an email",null],["delete all records",null],["",null]])assert.equal(parse(input),expected);
});
test('assistant has explicit offline provenance and stable task identity',()=>{
 assert.match(script,/sourceAssistantId:'daily-business-review'/);
 assert.match(script,/existing local task reused/);
 assert.match(script,/Provider status: disconnected/);
});
