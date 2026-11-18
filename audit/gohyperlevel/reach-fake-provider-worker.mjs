#!/usr/bin/env node
/**
 * Fake-provider-only REACH outbox dispatcher and reconciliation simulator.
 * Node SQLite talks ONLY to two Docker-mounted files; no HTTP/network calls.
 * Call: node --input-type=module - MODE OUTBOX_ID
 * Modes:
 *   before_accept  - claim local intent then intentionally exit
 *   after_accept   - fake provider accepts; stop before local acknowledgment
 *   reconcile      - recover, query synthetic receipt if supported, or review
 *   dispatch       - normal fake provider acceptance + acknowledgment
 */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const mode=process.argv[2],id=process.argv[3];
assert(process.env.REACH_SYNTHETIC_PROVIDER==='yes','fake-only worker must be explicitly enabled');
assert(['before_accept','after_accept','reconcile','dispatch'].includes(mode),'invalid fake dispatch mode');
assert(id&&/^[a-f0-9]{64}$/.test(id),'outbox ID must be sha256');
const app=new DatabaseSync('/data/pghl.db');
const fake=new DatabaseSync('/provider/ledger.db');
for(const db of [app,fake])db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
fake.exec(
  'CREATE TABLE IF NOT EXISTS fake_external_receipts ('+
  'id TEXT PRIMARY KEY, provider_key TEXT UNIQUE, outbox_key TEXT NOT NULL,'+
  'channel TEXT NOT NULL, payload_hash TEXT NOT NULL, accepted_at TEXT NOT NULL)'
);
const at=()=>new Date().toISOString();
const hash=s=>createHash('sha256').update(s).digest('hex');
function query(){
 const row=app.prepare('SELECT * FROM reach_synthetic_outbox WHERE id=?').get(id);
 assert(row,'fake worker cannot dispatch unrecognized outbox row');
 const payload=JSON.parse(row.payload);
 assert.equal(hash(row.payload),row.payload_hash,'payload must match immutable outbox hash');
 assert(['send_email','send_sms','webhook','social_post'].includes(row.channel));
 // Enforce fake inputs again independently of the app outbox.
 if(!payload.to&&!payload.url&&row.channel!=='social_post')throw Error('invalid synthetic fake target');
 if(row.channel==='send_email')assert(String(payload.to).endsWith('@example.invalid'));
 if(row.channel==='send_sms')assert(/^\+1555000[0-9]{4}$/.test(payload.to));
 if(row.channel==='webhook')assert(/^https:\/\/[a-z0-9.-]+\.invalid(\/|$)/i.test(payload.url));
 if(row.channel==='social_post')assert(payload.integrations.every(x=>/^reach-fake-postiz-[a-z0-9-]+$/.test(x)));
 return row;
}
function ledgerCount(row){
 return fake.prepare('SELECT COUNT(*) AS n FROM fake_external_receipts WHERE outbox_key=?').get(row.idempotency_key).n;
}
function acceptFake(row){
 const providerKey=row.provider_supports_idempotency===1?row.idempotency_key:null;
 const externalId=providerKey||'reach-synthetic-provider-'+randomUUID();
 fake.prepare(
  'INSERT OR IGNORE INTO fake_external_receipts (id,provider_key,outbox_key,channel,payload_hash,accepted_at) VALUES (?,?,?,?,?,?)'
 ).run(externalId,providerKey,row.idempotency_key,row.channel,row.payload_hash,at());
 const received=providerKey
  ?fake.prepare('SELECT * FROM fake_external_receipts WHERE provider_key=?').get(providerKey)
  :fake.prepare('SELECT * FROM fake_external_receipts WHERE id=?').get(externalId);
 assert(received,'fake provider acceptance not persisted');
 assert.equal(received.payload_hash,row.payload_hash,'provider idempotency key reused with changed payload');
 assert.equal(received.channel,row.channel,'provider idempotency reused across channels');
 return received.id;
}
function acknowledge(ref){
 const n=app.prepare("UPDATE reach_synthetic_outbox SET status='delivered',provider_ref=?,ambiguous_reason=NULL,updated_at=? WHERE id=? AND status='sending'").run(ref,at(),id).changes;
 assert.equal(n,1,'outbox acknowledgment must have exclusive sending state');
}
function manual(reason){
 const n=app.prepare("UPDATE reach_synthetic_outbox SET status='review_required',ambiguous_reason=?,updated_at=? WHERE id=? AND status='sending'").run(reason,at(),id).changes;
 assert.equal(n,1);
}
function claim(row){
 const n=app.prepare("UPDATE reach_synthetic_outbox SET status='sending',claimed_at=?,attempts=attempts+1,updated_at=? WHERE id=? AND status='pending'").run(at(),at(),id).changes;
 assert.equal(n,1,'only pending synthetic intents can be claimed');
 return query();
}
const before=query();
if(before.status==='delivered'||before.status==='review_required'){
 assert.equal(mode,'reconcile','finalized item should only be queried for reconciliation');
 console.log(JSON.stringify({mode,status:before.status,channel:before.channel,
  providerCount:ledgerCount(before),attempts:before.attempts,noRepeat:true}));
}else if(mode==='before_accept'){
 assert.equal(before.status,'pending');
 const row=claim(before);
 assert.equal(ledgerCount(row),0,'before_accept must precede provider acceptance');
 console.log(JSON.stringify({phase:'claimed-no-provider',channel:row.channel}),);
 process.exit(73); // real abrupt worker exit before acceptance
}else if(mode==='after_accept'){
 const row=before.status==='pending'?claim(before):before;
 assert.equal(row.status,'sending');
 const ref=acceptFake(row);
 assert(ref);
 assert.equal(ledgerCount(row),1,'synthetic provider accepted exactly once');
 console.log(JSON.stringify({phase:'accepted-ack-lost',channel:row.channel,providerCount:1}),);
 process.exit(74); // real worker exit before local acknowledgment
}else{
 let row=before;
 if(row.status==='pending')row=claim(row);
 assert.equal(row.status,'sending');
 let reconciliation='none',ref;
 if(mode==='reconcile'&&before.status==='sending'){
  if(row.provider_supports_lookup===1){
   const found=fake.prepare('SELECT * FROM fake_external_receipts WHERE provider_key=?').get(row.idempotency_key);
   if(found){
    assert.equal(found.payload_hash,row.payload_hash,'lookup payload must match');
    assert.equal(found.channel,row.channel);
    ref=found.id;
    reconciliation='found-provider-receipt';
   }else reconciliation='provider-key-not-found';
  }
  if(!ref&&row.provider_supports_idempotency!==1){
   manual('unresolved acceptance; no safe provider key or reliable lookup; human reconciliation required');
   const after=query();
   assert.equal(after.status,'review_required');
   console.log(JSON.stringify({mode,channel:row.channel,status:after.status,
    ledger:ledgerCount(row),attempts:after.attempts,reconciliation:'manual-review-no-resend'}));
   process.exit(0);
  }
 }
 if(!ref){ref=acceptFake(row);reconciliation=reconciliation==='none'?'fake-accepted':reconciliation+'-safe-key-retry';}
 acknowledge(ref);
 const after=query();
 assert.equal(after.status,'delivered');
 console.log(JSON.stringify({mode,channel:row.channel,status:after.status,ref,
  ledger:ledgerCount(row),attempts:after.attempts,reconciliation}));
}
app.close();
fake.close();
