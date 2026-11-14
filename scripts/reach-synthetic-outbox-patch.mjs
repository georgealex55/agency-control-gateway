#!/usr/bin/env node
/**
 * REACH synthetic-only outbox overlay on pinned GoHyperLevel checkout.
 * Run after copying audit/gohyperlevel/reach-synthetic-outbox.ts to
 * server/services/reach-synthetic-outbox.ts in a disposable checkout.
 * This creates NO external delivery adapter, and refuses actual contacts.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root=resolve(process.argv[2]||'_upstream/gohyperlevel');
const outboxFile=join(root,'server/services/reach-synthetic-outbox.ts');
assert(existsSync(outboxFile),'Synthetic outbox implementation was not copied');
const path=join(root,'server/services/workflow-engine.ts');
let s=readFileSync(path,'utf8');
function edit(before,after){
 const n=s.split(before).length-1;
 assert.equal(n,1,'Upstream drift: expected one match, got '+n+' for '+before.slice(0,100));
 s=s.replace(before,after);
}
edit("import { reportStepError } from './workflow-errors.js';",
 [
  "import { reportStepError } from './workflow-errors.js';",
  "import { installReachSyntheticOutbox, reachOutboxChannel, enqueueReachSyntheticExternal } from './reach-synthetic-outbox.js';"
 ].join('\n'));
edit(
 "export function installWorkflowEngine(app: App) {",
 [
  "export function installWorkflowEngine(app: App) {",
  "  installReachSyntheticOutbox(app);"
 ].join('\n')
);
edit(
 "      const raw = await runAction(app, run, step, vars, fc);",
 [
  "      // Synthetic only: durable intent, never invoke the actual external provider.",
  "      const raw = reachOutboxChannel(step.type)",
  "        ? enqueueReachSyntheticExternal(app, run, step, vars, fc.cursor)",
  "        : await runAction(app, run, step, vars, fc);"
 ].join('\n')
);
writeFileSync(path,s);
console.log('REACH synthetic external-action outbox overlay applied; real sends blocked');
