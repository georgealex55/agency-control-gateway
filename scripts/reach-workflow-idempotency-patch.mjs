#!/usr/bin/env node
/**
 * REACH staging-only overlay: atomic receipts for internal create_task/add_note.
 * Pinned source: GoHyperLevel 24ea786b85c3240ae4f24dcad6f657749730c56e.
 * This does NOT establish exactly-once email/SMS/webhooks.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(process.argv[2] || '_upstream/gohyperlevel');
const path = join(root, 'server/services/workflow-engine.ts');
let source = readFileSync(path, 'utf8');
function replaceOnce(before, after) {
  const count = source.split(before).length - 1;
  assert.equal(count, 1, 'GoHyperLevel source drift; expected one match (' + count + '): ' + before.slice(0,80));
  source = source.replace(before, after);
}
replaceOnce('export function installWorkflowEngine(app: App) {', [
  'export function installWorkflowEngine(app: App) {',
  '  // REACH staging-only: internal write and receipt share an SQLite transaction.',
  '  app.db.raw.exec("CREATE TABLE IF NOT EXISTS reach_workflow_internal_receipts (run_id TEXT NOT NULL, execution_key TEXT NOT NULL, step_type TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (run_id, execution_key))");'
].join('\n'));
replaceOnce(
  'async function runAction(app: App, run: RunState, step: Step, vars: Record<string, any>, fc: FlowCtx): Promise<ActionResult> {',
  [
    '/** One receipt per run, cursor, durable step ordinal; loops use different ordinals. */',
    'function onceReachInternal(app: App, run: RunState, step: Step, fc: FlowCtx, action: () => string): string {',
    '  const key = JSON.stringify([fc.cursor, Number(run.vars?._steps ?? 0)]);',
    '  return app.db.tx(() => {',
    '    const prior = app.db.get<{result: string}>("SELECT result FROM reach_workflow_internal_receipts WHERE run_id = ? AND execution_key = ?", run.id, key);',
    '    if (prior) return prior.result;',
    '    const result = action();',
    '    app.db.run("INSERT INTO reach_workflow_internal_receipts (run_id,execution_key,step_type,result,created_at) VALUES (?,?,?,?,?)", run.id, key, step.type, result, now());',
    '    return result;',
    '  });',
    '}',
    '',
    'async function runAction(app: App, run: RunState, step: Step, vars: Record<string, any>, fc: FlowCtx): Promise<ActionResult> {'
  ].join('\n')
);
replaceOnce(
  [
    "    case 'create_task': {",
    "      const due = step.due_in_days !== undefined && step.due_in_days !== '' ? new Date(Date.now() + Number(step.due_in_days) * 864e5).toISOString() : null;",
    "      app.db.insert('tasks', { id: id(), location_id: loc, contact_id: cid, title: t(step.title) || 'Aufgabe', description: t(step.description), due_at: due, assigned_to: step.assigned_to || null, done: 0, created_at: now() });",
    "      return 'Aufgabe angelegt';",
    "    }",
    "    case 'add_note':",
    "      // Modules add columns to the note (notes-plus: title, colour, pinned) through app.services.noteExtras.",
    "      app.db.insert('notes', { id: id(), location_id: loc, contact_id: cid, body: t(step.body), user_id: null, created_at: now(), ...(app.services.noteExtras?.(step, t) ?? {}) });",
    "      return 'Notiz angelegt';"
  ].join('\n'),
  [
    "    case 'create_task':",
    "      return onceReachInternal(app, run, step, fc, () => {",
    "        const due = step.due_in_days !== undefined && step.due_in_days !== '' ? new Date(Date.now() + Number(step.due_in_days) * 864e5).toISOString() : null;",
    "        app.db.insert('tasks', { id: id(), location_id: loc, contact_id: cid, title: t(step.title) || 'Aufgabe', description: t(step.description), due_at: due, assigned_to: step.assigned_to || null, done: 0, created_at: now() });",
    "        return 'Aufgabe angelegt';",
    "      });",
    "    case 'add_note':",
    "      return onceReachInternal(app, run, step, fc, () => {",
    "        app.db.insert('notes', { id: id(), location_id: loc, contact_id: cid, body: t(step.body), user_id: null, created_at: now(), ...(app.services.noteExtras?.(step, t) ?? {}) });",
    "        return 'Notiz angelegt';",
    "      });"
  ].join('\n')
);
writeFileSync(path,source);
console.log('REACH synthetic-only internal receipt patch applied');
