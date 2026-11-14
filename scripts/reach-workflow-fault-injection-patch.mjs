#!/usr/bin/env node
/** Only injected into an offline synthetic QA container. Never in production images. */
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
const root=resolve(process.argv[2]||'_upstream/gohyperlevel');
const path=join(root,'server/services/workflow-engine.ts');
let code=readFileSync(path,'utf8');
function swap(before,after){
 const n=code.split(before).length-1;
 assert.equal(n,1,'Fault overlay drift: '+before.slice(0,90)+' matches='+n);
 code=code.replace(before,after);
}
code="import { existsSync as reachFaultExists, writeFileSync as reachFaultWrite } from 'node:fs';\n"+code;
const helper=[
  '/** Fault injection requires an explicit synthetic-only environment flag. */',
  'function reachFault(run: RunState, step: Step | undefined, stage: string): void {',
  "  if (process.env.REACH_FAULT_SYNTHETIC !== 'yes') return;",
  "  if (process.env.REACH_FAULT_SYNTHETIC === 'yes') console.error('[REACH-FAULT-HOOK]', JSON.stringify({actualStage:stage,actualStep:step?.id,wantedStage:process.env.REACH_FAULT_STAGE,wantedStep:process.env.REACH_FAULT_STEP_ID}));",
  "  if (!step || !['create_task', 'add_note', 'send_email', 'send_sms', 'webhook', 'social_post'].includes(step.type) || stage !== process.env.REACH_FAULT_STAGE) return;",
  "  const marker = '/data/reach-fault-fired';",
  "  console.error('[REACH-FAULT-MATCH]', JSON.stringify({stepId:step.id,type:step.type,stage,priorMarker:reachFaultExists(marker)}));",
  '  reachFaultWrite(marker, JSON.stringify({stage, stepId:step.id, runId:run.id}) + String.fromCharCode(10));',
  "  process.kill(process.pid, 'SIGKILL');",
  "  process.exit(137); // Fallback: no request may continue past the fault point",
  '}',
  ''
].join('\n');
swap('export async function execute(app: App, run: RunState, wf: any, opts: ExecOptions = {}): Promise<ExecResult> {',
 helper+'export async function execute(app: App, run: RunState, wf: any, opts: ExecOptions = {}): Promise<ExecResult> {'
);
swap("    if (acted && !dry) opts.checkpoint?.(here);",
 [
 "    if (acted && !dry) opts.checkpoint?.(here);",
 "    if (acted && !dry) reachFault(run, stepAt(steps, here), 'after_checkpoint');"
 ].join('\n')
);
swap(
 "      acted = true;\n      const raw = await runAction(app, run, step, vars, fc);",
 [
 "      acted = true;",
 "      reachFault(run, step, 'before_action');",
 "      const raw = await runAction(app, run, step, vars, fc);",
 "      reachFault(run, step, 'after_action');"
 ].join('\n')
);
writeFileSync(path,code);
console.log('REACH fault injection installed in disposable checkout only');
