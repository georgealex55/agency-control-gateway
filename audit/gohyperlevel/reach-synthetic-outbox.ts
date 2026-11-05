/**
 * REACH staging-only transactional synthetic outbox.
 *
 * This fixture can NEVER dispatch a real email, SMS, webhook or Postiz action.
 * It only persists synthetic intents and rejects every non-.invalid target.
 * Real provider adapters are NOT included. Never use it for customer delivery.
 */
import { createHash } from 'node:crypto';
import type { App } from '../core/app.js';
import { render } from '../core/template.js';
import { now } from '../core/util.js';
import type { Cursor, RunState, Step } from './workflow-engine.js';

export const reachOutboxChannel = (type: string) =>
  ['send_email', 'send_sms', 'webhook', 'social_post'].includes(type);

export function installReachSyntheticOutbox(app: App): void {
  app.db.raw.exec([
    'CREATE TABLE IF NOT EXISTS reach_synthetic_outbox (',
    '  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, location_id TEXT NOT NULL,',
    '  contact_id TEXT NOT NULL, step_id TEXT NOT NULL, execution_key TEXT NOT NULL,',
    '  channel TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL,',
    '  idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT "pending",',
    '  attempts INTEGER NOT NULL DEFAULT 0, provider_ref TEXT,',
    '  provider_supports_idempotency INTEGER NOT NULL DEFAULT 1,',
    '  provider_supports_lookup INTEGER NOT NULL DEFAULT 1,',
    '  ambiguous_reason TEXT, claimed_at TEXT, created_at TEXT NOT NULL,',
    '  updated_at TEXT NOT NULL, UNIQUE(run_id, execution_key)',
    ')',
  ].join('\n'));
  app.db.raw.exec('CREATE INDEX IF NOT EXISTS reach_synthetic_outbox_status ON reach_synthetic_outbox(status, created_at)');
}

const digest = (v: string) => createHash('sha256').update(v).digest('hex');

export function enqueueReachSyntheticExternal(
  app: App, run: RunState, step: Step, vars: Record<string, any>, cursor: Cursor,
): string {
  if (process.env.REACH_SYNTHETIC_OUTBOX !== 'yes')
    throw new Error('REACH synthetic outbox is disabled; refusing real external delivery');
  const contactEmail = String(vars.contact?.email ?? '').toLowerCase();
  if (!contactEmail.endsWith('@example.invalid'))
    throw new Error('REACH synthetic outbox requires a .invalid contact email');

  const channel = step.type;
  const text = (value: unknown) => render(String(value ?? ''), vars);
  let payload: Record<string, unknown>;
  switch (channel) {
    case 'send_email':
      payload = { to: contactEmail, subject: text(step.subject), body: text(step.body), channel: 'email' };
      if (!String(payload.subject).trim() && !String(payload.body).trim()) throw new Error('Synthetic email is blank');
      break;
    case 'send_sms': {
      const phone = String(vars.contact?.phone ?? '');
      if (!/^\+1555000[0-9]{4}$/.test(phone)) throw new Error('Synthetic SMS must have a reserved fake +1555000 phone');
      payload = { to: phone, body: text(step.body), channel: 'sms' };
      if (!String(payload.body).trim()) throw new Error('Synthetic SMS is blank');
      break;
    }
    case 'webhook': {
      const url = String(step.url ?? '');
      if (!/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.invalid(?:\/|$)/i.test(url))
        throw new Error('Synthetic webhook URL must use https and a .invalid host');
      payload = { url, method: step.method === 'GET' ? 'GET' : 'POST', contact_id: run.contact_id, channel: 'webhook' };
      break;
    }
    case 'social_post': {
      const integrations = Array.isArray(step.integration_ids) ? step.integration_ids.map(String) : [];
      if (!integrations.length || integrations.some((v: string) => !/^reach-fake-postiz-[a-z0-9-]+$/.test(v)))
        throw new Error('Synthetic Postiz requires fake integration IDs only');
      payload = { integrations, body: text(step.body), mode: step.mode === 'now' ? 'now' : 'draft', channel: 'postiz' };
      if (!String(payload.body).trim()) throw new Error('Synthetic Postiz content is blank');
      break;
    }
    default:
      throw new Error('Unknown REACH synthetic action: ' + channel);
  }

  // Same cursor + execution ordinal will reoccur after a crash before the
  // normal workflow cursor checkpoint. This deterministic identity prevents
  // a second enqueue even though the engine checkpoints separately.
  const executionKey = JSON.stringify([cursor, Number(run.vars?._steps ?? 0), step.id]);
  const idem = digest(JSON.stringify([run.id, executionKey, channel]));
  const body = JSON.stringify(payload);
  const at = now();
  app.db.tx(() => {
    app.db.run(
      'INSERT OR IGNORE INTO reach_synthetic_outbox (id,run_id,location_id,contact_id,step_id,execution_key,channel,payload,payload_hash,idempotency_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      idem, run.id, run.location_id, run.contact_id, step.id, executionKey,
      channel, body, digest(body), idem, at, at,
    );
    const stored = app.db.get<{payload_hash: string; channel: string}>(
      'SELECT payload_hash,channel FROM reach_synthetic_outbox WHERE run_id = ? AND execution_key = ?',
      run.id, executionKey,
    );
    if (!stored || stored.payload_hash !== digest(body) || stored.channel !== channel)
      throw new Error('REACH synthetic outbox idempotency conflict');
  });
  return 'REACH synthetic outbox: queued ' + channel;
}
