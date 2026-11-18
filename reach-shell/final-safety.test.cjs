/** REACH 2.1 staging acceptance invariants. Run: node --test reach-shell/final-safety.test.cjs
 * Static source checks complement, but do not replace, browser/tenant tests.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const mirror=fs.readFileSync(path.join(__dirname,'../ghl-gpt-gateway/public/reach-demo/index.html'),'utf8');
test('standalone source and published preview mirror are identical',()=>assert.equal(source,mirror));
test('public login is explicitly an offline demo, not real authentication',()=>{
 assert.match(source,/demo@reach\.local/);
 assert.match(source,/ReachDemo2026!/);
 assert.match(source,/DEMO DATA · OFFLINE/);
});
test('local schema and replay deduplication remain present',()=>{
 assert.match(source,/__schemaVersion/);
 assert.match(source,/processedKeys/);
});
test('no network-send primitive is introduced into standalone shell',()=>{
 const script=source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 assert.doesNotMatch(script,/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\s*\(/);
});
test('provider adapters are explicitly disconnected and non-sending',()=>{
 assert.match(source,/providerAdapters/);
 assert.match(source,/Not connected/);
 assert.match(source,/Customer-owned Neon/);
});
