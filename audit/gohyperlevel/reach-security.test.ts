/**
 * REACH CRM staged security and recovery regression suite.
 * No real identities, integrations or external communication.
 * The suite intentionally asserts that a key BOUND TO a restricted member
 * cannot expose information the same member cannot see in the browser.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp } from './helpers.js';

let t: Awaited<ReturnType<typeof startTestApp>>;
let A = '', B = '', memberId = '', key = '', unbound = '', readAgency = '', memberCookie = '';
let pipe: any, mineId='', foreignId='', memberContact: any, otherContact: any;
const synthetic = (id:string) => 'reach-' + id + '@example.invalid';

async function ok(method:'get'|'post'|'patch'|'put', path:string, data?:any, headers?:Record<string,string>) {
  const r = method==='get' ? await t.api.get(path, headers) :
    method==='post' ? await t.api.post(path, data ?? {}, headers) :
    method==='patch' ? await t.api.patch(path, data ?? {}) :
    await t.api.put(path, data ?? {});
  expect(r.status, method.toUpperCase()+' '+path+' '+JSON.stringify(r.data)).toBe(200);
  return r.data;
}
const bearer = (k:string) => ({authorization:'Bearer '+k});
async function callMcp(token:string, name:string, args:Record<string,any>) {
  const r = await t.api.raw('/mcp', {
    method:'POST', headers:{authorization:'Bearer '+token, 'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})
  });
  expect(r.status).toBe(200);
  const j=await r.json();
  if(j.error) return {error:true,body:JSON.stringify(j.error)};
  const body=String(j.result?.content?.[0]?.text ?? '');
  return {error:!!j.result?.isError,body,data:j.result?.structuredContent};
}
const forecast = (d:any) => {
  expect(d.open.value,'Open total').toBe(0);
  expect(d.open.weighted,'Weighted total').toBe(0);
  for(const b of [...(d.months??[]),d.later]) {
    expect(b.value,'Monthly/later amount').toBe(0);
    expect(b.weighted,'Monthly/later weight').toBe(0);
  }
  for(const r of Object.values(d.risks??{}) as any[]) {
    expect(r.value,'Risk total').toBe(0);
    for(const deal of r.deals??[]) expect(deal.value,'Risk deal amount').toBe(0);
  }
  expect(d.hidden_fields).toContain('value');
};

beforeAll(async()=>{
  t=await startTestApp();
  await t.setup();
  A=t.api.location;
  B=(await ok('post','/api/locations',{name:'REACH isolated second workspace'})).id;
  // Sensitive values live only in disposable SQLite and synthetic accounts.
  const u=await ok('post','/api/users',{
    email:synthetic('restricted-member'),password:'Synthetic-pw-2389',name:'Restricted Worker',
    locations:[A],permissions:['contacts','opportunities','workflows','settings']
  });
  memberId=u.id;
  let memberLogin=await t.api.raw('/api/auth/login',{
    method:'POST',headers:{'content-type':'application/json','x-pghl':'1'},
    body:JSON.stringify({email:synthetic('restricted-member'),password:'Synthetic-pw-2389'})
  });
  expect(memberLogin.status).toBe(200);
  memberCookie=memberLogin.headers.get('set-cookie')?.split(';')[0]??'';
  expect(memberCookie).toBeTruthy();

  await ok('post','/api/custom-fields',{key:'internal_budget',label:'Internal Budget'});
  memberContact=await ok('post','/api/contacts',{
    email:synthetic('visible-contact'),first_name:'Member',last_name:'Contact',
    custom:{internal_budget:'REACH-HIDDEN-BUDGET-SECRET'}
  });
  pipe=await ok('post','/api/pipelines',{
    name:'REACH synthetic financial pipeline',stages:[{name:'Stage A',probability:10},{name:'Stage B',probability:50}]
  });
  const mk=async(name:string,value:number,owner:string) => {
    const p=await ok('post','/api/opportunities',{name,value,pipeline_id:pipe.id,
      stage_id:pipe.stages[1].id,contact_id:memberContact.id,expected_close_date:'2020-01-01'});
    t.app.db.run('UPDATE opportunities SET assigned_to = ? WHERE id = ?',owner,p.id);
    return p.id;
  };
  mineId=await mk('Member synthetic opportunity',777,memberId);
  foreignId=await mk('Other synthetic opportunity',50000,
    t.app.db.get<{id:string}>('SELECT id FROM users WHERE email = ?', 'chef@example.com')!.id);
  await ok('put','/api/sales/access',{
    enabled:true,rules:{default:{levels:{deals:'own'},
      hidden:{deals:['value'],contacts:['custom.internal_budget']}}}
  });
  const created=await ok('post','/api/api-keys',{name:'REACH bound member credential',user_id:memberId});
  key=created.key;
  unbound=(await ok('post','/api/api-keys',{name:'REACH unbound administrative integration'})).key;
  readAgency=(await ok('post','/api/agency/api-keys',{name:'REACH read-only agency synthetic',scope:'read'})).key;
  t.api.setLocation(B);
  otherContact=await ok('post','/api/contacts',{
    email:synthetic('workspace-b-private'),first_name:'TenantBPrivate'
  });
  t.api.setLocation(A);
},120000);
afterAll(()=>t?.close());

describe('REACH: reproduce forecast restricted-access and hidden field assertions',()=>{
  it('original foreground user masks forecast amounts and custom contact fields',async()=>{
    const browserHeaders={'x-pghl':'1','x-location-id':A,cookie:memberCookie};
    const r=await t.api.raw('/api/deal-forecast?pipeline_id='+pipe.id,{headers:browserHeaders});
    expect(r.status).toBe(200);
    const f=await r.json();
    forecast(f);
    expect(f.open.count).toBe(1);
    const c=await t.api.raw('/api/contacts/'+memberContact.id,{headers:browserHeaders});
    expect(c.status).toBe(200);
    const result=await c.json();
    expect(JSON.stringify(result)).not.toContain('REACH-HIDDEN-BUDGET-SECRET');
  });
  it('member-bound REST API key respects same rules as the user it represents',async()=>{
    const r=await t.api.get('/api/deal-forecast?pipeline_id='+pipe.id,bearer(key));
    expect(r.status,JSON.stringify(r.data)).toBe(200);
    forecast(r.data);
    expect(r.data.open.count).toBe(1);
    const c=await t.api.get('/api/contacts/'+memberContact.id,bearer(key));
    expect(c.status).toBe(200);
    expect(JSON.stringify(c.data)).not.toContain('REACH-HIDDEN-BUDGET-SECRET');
  });
  it('direct user-bound key cannot select B or gain unauthorized areas',async()=>{
    const r=await t.api.get('/api/contacts', {...bearer(key),'x-location-id':B});
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.data)).not.toContain(synthetic('workspace-b-private'));
    const b=await t.api.get('/api/contacts/'+otherContact.id,bearer(key));
    expect(b.status).toBe(404);
    expect((await t.api.get('/api/invoices',bearer(key))).status).toBe(403);
  });
  it('unbound admin integration is not mistaken for a human-bound credential',async()=>{
    const r=await t.api.get('/api/deal-forecast?pipeline_id='+pipe.id,bearer(unbound));
    expect(r.status).toBe(200);
    expect(r.data.open.value).toBe(50777);
  });
  it('the original deal forecast regression remains independently executable',()=>{
    expect(mineId).toBeTruthy();
    expect(foreignId).toBeTruthy();
  });
});

describe('REACH: MCP and API scopes',()=>{
  it('member-bound MCP forecast respects hidden amounts',async()=>{
    const r=await callMcp(key,'ghl_deal_forecast',{location_id:A,pipeline_id:pipe.id});
    expect(r.error,r.body).toBe(false);
    forecast(r.data ?? JSON.parse(r.body));
  });
  it('MCP cannot use a tenant A key to retrieve tenant B',async()=>{
    const cross=await callMcp(key,'ghl_api',{
      method:'GET',path:'/api/contacts/'+otherContact.id,location_id:A
    });
    expect(cross.error).toBe(true);
    expect(cross.body).not.toContain('TenantBPrivate');
    const switched=await callMcp(key,'ghl_deal_forecast',{
      location_id:B,pipeline_id:pipe.id
    });
    expect(switched.error).toBe(true);
    expect(switched.body).toMatch(/403|Sub-Account/);
  });
  it('agency read key cannot write REST or via MCP relay',async()=>{
    const r=await t.api.post('/api/contacts',{email:synthetic('should-not-create')},
      {...bearer(readAgency),'x-location-id':A});
    expect(r.status).toBe(403);
    const relay=await callMcp(readAgency,'ghl_api',{
      method:'POST',path:'/api/contacts',location_id:A,
      body:{email:synthetic('should-not-create-mcp')}
    });
    expect(relay.error).toBe(true);
    expect(relay.body).toMatch(/403|lesen/);
    const check=await t.api.get('/api/contacts',bearer(unbound));
    expect(JSON.stringify(check.data)).not.toContain(synthetic('should-not-create'));
  });
});

describe('REACH: scheduler restart, idempotency and retry using only local steps',()=>{
  it('restores stale running checkpoint and performs the remaining internal step once',async()=>{
    const c=await ok('post','/api/contacts',{
      email:synthetic('recovery-1'),first_name:'Recovered'
    });
    const w=await ok('post','/api/workflows',{
      name:'REACH synthetic checkpoint recovery',trigger:{type:'manual',config:{}},
      steps:[{type:'add_tag',tags:['synthetic-prior-step']},
        {type:'create_task',title:'REACH recovery once only'}]
    });
    await ok('patch','/api/workflows/'+w.id,{status:'active'});
    // Stand in for a process crashed after it saved a step cursor.
    const id='reach-crash-'+Math.random().toString(36).slice(2);
    const at=new Date(Date.now()-7*60*1000).toISOString();
    t.app.db.insert('workflow_runs',{
      id,workflow_id:w.id,location_id:A,contact_id:c.id,status:'running',
      cursor:[1],event:{manual:true},next_run_at:null,log:[],vars:{},
      created_at:at,updated_at:at
    });
    await t.app.tick();
    let row=t.app.db.get<any>('SELECT status,cursor FROM workflow_runs WHERE id = ?',id);
    expect(row.status).toBe('completed');
    const tasks=await t.api.get('/api/tasks');
    expect(tasks.status).toBe(200);
    expect(tasks.data.filter((x:any)=>x.title==='REACH recovery once only')).toHaveLength(1);
    await t.app.tick();
    const again=await t.api.get('/api/tasks');
    expect(again.data.filter((x:any)=>x.title==='REACH recovery once only')).toHaveLength(1);
  },120000);
  it('retries only the failed step after editing a broken local-only workflow',async()=>{
    const c=await ok('post','/api/contacts',{
      email:synthetic('recovery-2'),first_name:'Retry'
    });
    const w=await ok('post','/api/workflows',{
      name:'REACH synthetic failed step retry',trigger:{type:'manual',config:{}},
      settings:{stop_on_error:true},
      steps:[{id:'first-step',type:'add_tag',tags:['once-before-failure']},
        {id:'broken-step',type:'webhook'}, // no URL: fails locally, cannot send
        {id:'last-step',type:'add_tag',tags:['after-fix']}]
    });
    await ok('patch','/api/workflows/'+w.id,{status:'active'});
    const enroll=await t.api.post('/api/workflows/'+w.id+'/enroll',{contact_ids:[c.id]});
    expect(enroll.status).toBe(200);
    const getRuns=()=>t.api.get('/api/workflows/'+w.id+'/runs');
    let runs=await getRuns();
    expect(runs.data.runs[0].status).toBe('failed');
    const runId=runs.data.runs[0].id;
    await ok('patch','/api/workflows/'+w.id,{
      steps:[{id:'first-step',type:'add_tag',tags:['once-before-failure']},
        {id:'broken-step',type:'add_note',body:'REACH internally repaired step'},
        {id:'last-step',type:'add_tag',tags:['after-fix']}]
    });
    const retry=await t.api.post('/api/workflow-runs/'+runId+'/retry',{});
    expect(retry.status,JSON.stringify(retry.data)).toBe(200);
    expect(retry.data.status).toBe('completed');
    runs=await getRuns();
    const full=await t.api.get('/api/workflow-runs/'+runId);
    expect(full.status).toBe(200);
    expect(full.data.log.filter((x:any)=>x.type==='add_tag'&&x.result==='once-before-failure')).toHaveLength(1);
    const updated=await t.api.get('/api/contacts/'+c.id);
    expect(updated.data.tags).toContain('after-fix');
    expect((await t.api.post('/api/workflow-runs/'+runId+'/retry',{})).status).toBe(400);
  },120000);
});
