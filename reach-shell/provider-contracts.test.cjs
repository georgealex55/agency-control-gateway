'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
test('offline shell script parses',()=>assert.doesNotThrow(()=>new vm.Script(script)));
test('all seven adapter contracts remain disconnected and non-executing',()=>{
 const match=script.match(/const providerAdapters=[\s\S]*?function settingsContent\(\)/);
 assert.ok(match,'adapter contract exists');
 const context=vm.createContext({});
 vm.runInContext(match[0].replace(/function settingsContent\(\)$/,'' )+';globalThis.result={adapters:providerAdapters,readiness:providerReadiness(),unknown:providerStatus("unknown")}',context);
 const {adapters,readiness,unknown}=context.result;
 assert.equal(adapters.length,7);assert.equal(readiness.length,7);
 for(const a of adapters){assert.equal(a.status,'disconnected');assert.equal(a.mode,'contract-only');assert.equal(a.canSend,false);assert.equal(a.canReadLive,false);assert.ok(a.requires)}
 assert.equal(unknown.status,'unsupported');assert.equal(unknown.canSend,false);
});
test('setup and connection screens disclose provider requirements',()=>{
 assert.match(script,/Provider readiness · Contract only/);
 assert.match(script,/Future setup:/);
 assert.match(script,/No provider connection is attempted/);
 assert.match(script,/Not connected/);
});
test('demo credential gate remains explicitly public',()=>{
 assert.match(script,/demo@reach\.local/);assert.match(script,/ReachDemo2026!/);
 assert.match(script,/NO REAL AUTH/);
});
