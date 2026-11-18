'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
test('REACH 2.1 owner workspace keeps light cards and navy sidebar',()=>{
 assert.match(html,/background:#f3f6fb/);
 assert.match(html,/\.side\{background:#101f3d/);
 assert.match(html,/\.card,\.login\{background:#fff/);
});
test('mobile drawer and tablet cards are responsive',()=>{
 assert.match(html,/@media\(max-width:800px\)/);
 assert.match(html,/\.side\{position:fixed;top:0/);
 assert.match(html,/@media\(min-width:801px\) and \(max-width:1100px\)/);
});
test('focus and reduced motion safeguards exist',()=>{
 assert.match(html,/outline:3px solid #e5a642/);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.match(html,/aria-expanded=/);
 assert.match(html,/aria-controls="sidebar"/);
});
test('offline dummy sign-in and disconnected provider labeling preserved',()=>{
 assert.match(html,/demo@reach\.local/);
 assert.match(html,/ReachDemo2026!/);
 assert.match(html,/External integrations are not connected/);
});
