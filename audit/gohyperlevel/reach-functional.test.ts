/**
 * REACH CRM isolated functional gates, copied into the pinned upstream test
 * checkout by the POC runner. All data are synthetic; no external providers.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp } from './helpers.js';

let t: Awaited<ReturnType<typeof startTestApp>>;
const outbound: unknown[] = [];
const gate = (r: {status:number;data:any}, label:string) => {
  expect(r.status, label + ': ' + JSON.stringify(r.data)).toBe(200);
  return r.data;
};
const post = async (path:string, data:unknown, label=path) => gate(await t.api.post(path,data),label);
const patch = async (path:string, data:unknown, label=path) => gate(await t.api.patch(path,data),label);
const read = async (path:string, label=path) => gate(await t.api.get(path),label);
const rawForm = (path:string, body:Record<string,string>, cookie='') => t.api.raw(path, {
  method:'POST', redirect:'manual',
  headers:{'content-type':'application/x-www-form-urlencoded', ...(cookie?{cookie}:{})},
  body:new URLSearchParams(body).toString(),
});

beforeAll(async () => {
  t = await startTestApp();
  await t.setup();
  // The only permitted mail transport captures synthetic messages in memory.
  t.app.services.memberMailer = async (_loc:unknown, mail:unknown) => {
    outbound.push(mail);
    return {status:'sent'};
  };
}, 120000);
afterAll(async () => { await t?.close(); });

describe('REACH: real funnel/page editor persistence and preview contracts', () => {
  it('edits nested sections, saves and previews without accidentally persisting drafts', async () => {
    const site = await post('/api/funnels', {
      name:'REACH synthetic brand studio',kind:'website',template:'blank'
    });
    const page = site.pages[0];
    expect(page?.id).toBeTruthy();
    const savedHeading = 'REACH Saved Synthetic Funnel';
    const draftHeading = 'REACH Draft-Only Preview';
    const blocks = [{
      id:'section-qa',type:'section',rows:[{
        id:'row-qa',type:'row',cols:[{
          id:'column-qa',type:'col',span:12,
          blocks:[{id:'hero-qa',type:'hero',heading:savedHeading,
            subheading:'A fully synthetic test page',align:'center'}]
        }]
      }]
    }];
    const saved = await patch('/api/funnel-pages/' + page.id, {
      blocks, seo:{title:'REACH synthetic SEO title',description:'Automation gate - no client data'}
    });
    expect(JSON.stringify(saved.blocks)).toContain(savedHeading);
    const detail = await read('/api/funnels/' + site.id);
    expect(JSON.stringify(detail.pages[0].blocks)).toContain(savedHeading);
    expect(detail.pages[0].seo.title).toBe('REACH synthetic SEO title');

    const draftBlocks = JSON.parse(JSON.stringify(detail.pages[0].blocks));
    draftBlocks[0].rows[0].cols[0].blocks[0].heading=draftHeading;
    const preview=await t.api.post('/api/funnel-pages/' + page.id + '/preview',{blocks:draftBlocks});
    expect(preview.status).toBe(200);
    expect(preview.data).toContain(draftHeading);
    const unchanged=await read('/api/funnels/' + site.id);
    expect(JSON.stringify(unchanged.pages[0].blocks)).toContain(savedHeading);
    expect(JSON.stringify(unchanged.pages[0].blocks)).not.toContain(draftHeading);

    // The public route is served only by a disposable, isolated local app.
    const rendered=await t.api.raw('/p/' + site.slug + '/' + page.slug);
    expect(rendered.status).toBe(200);
    expect(await rendered.text()).toContain(savedHeading);
    const second=await post('/api/funnels/' + site.id + '/pages', {
      name:'REACH confirmation',blocks:[{id:'confirmation',type:'heading',text:'Success in QA',level:2}]
    });
    const refreshed=await read('/api/funnels/' + site.id);
    expect(refreshed.pages.some((p:any)=>p.id===second.id)).toBe(true);
  }, 120000);
});

describe('REACH: LMS authoring, preview, enrollment and learner progress', () => {
  it('creates modules and lessons, updates a lesson and completes an enrolled learner journey', async () => {
    const course=await post('/api/courses',{
      title:'REACH Synthetic Learning Path',description:'Synthetic instruction only',empty:true
    });
    const module=await post('/api/courses/' + course.id + '/modules',{
      title:'Foundation',published:true,drip_days:0
    });
    const lesson1=await post('/api/courses/' + course.id + '/lessons',{
      module_id:module.id,title:'First synthetic lesson',body:'## Synthetic intro',published:true
    });
    const lesson2=await post('/api/courses/' + course.id + '/lessons',{
      module_id:module.id,title:'Second synthetic lesson',body:'## Synthetic completion',published:true
    });
    const updated=await patch('/api/courses/' + course.id + '/lessons/' + lesson1.id,{
      title:'Edited first synthetic lesson',body:'## REACH lesson edited and saved'
    });
    expect(updated.title).toBe('Edited first synthetic lesson');
    const lessonPreview=await t.api.post('/api/courses/' + course.id + '/lessons/' + lesson1.id + '/preview',{
      title:'Temporary draft title, not saved',
    });
    expect(lessonPreview.status).toBe(200);
    expect(lessonPreview.data).toContain('Temporary draft title, not saved');
    const outline=await read('/api/courses/' + course.id);
    expect(outline.modules[0].lessons).toHaveLength(2);
    expect(outline.modules[0].lessons[0].title).toBe('Edited first synthetic lesson');
    expect(JSON.stringify(outline)).not.toContain('Temporary draft title, not saved');

    await patch('/api/courses/' + course.id,{status:'published'});
    const contact=await post('/api/contacts',{
      email:'reach-lms-student@example.invalid',first_name:'Synthetic',last_name:'Learner'
    });
    const enrolled=await post('/api/courses/' + course.id + '/enrollments',{contact_id:contact.id});
    expect(enrolled.status).toBe('active');
    const before=await read('/api/courses/' + course.id + '/enrollments');
    expect(before.find((x:any)=>x.contact_id===contact.id)?.progress).toMatchObject({done:0,total:2,percent:0});
    const send=await post('/api/courses/' + course.id + '/enrollments/' + contact.id + '/login-link',{});
    expect(send.status).toBe('sent');
    const letter=outbound[outbound.length-1] as {text?:string};
    const link=letter?.text?.match(/https?:\/\/\S+\/auth\?token=\S+/)?.[0];
    expect(link,'Captured synthetic learner link').toBeTruthy();
    const auth=new URL(link!);
    const token=auth.searchParams.get('token');
    expect(token).toBeTruthy();
    const loc=t.api.location;
    const login=await rawForm('/portal/' + loc + '/auth',{token:token!});
    expect(login.status).toBe(303);
    const cookie=login.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toMatch(new RegExp('^pm_' + loc + '='));
    const learnerPath='/portal/' + loc + '/c/' + course.slug;
    const learnerHome=await t.api.raw(learnerPath,{headers:{cookie:cookie!}});
    expect(learnerHome.status).toBe(200);
    expect(await learnerHome.text()).toContain('Edited first synthetic lesson');
    const first=await rawForm(learnerPath + '/' + lesson1.id + '/complete',{done:'1'},cookie);
    expect(first.status).toBe(303);
    const midway=await read('/api/courses/' + course.id + '/enrollments');
    expect(midway.find((x:any)=>x.contact_id===contact.id)?.progress).toMatchObject({done:1,total:2,percent:50});
    const last=await rawForm(learnerPath + '/' + lesson2.id + '/complete',{done:'1'},cookie);
    expect(last.status).toBe(303);
    const after=await read('/api/courses/' + course.id + '/enrollments');
    expect(after.find((x:any)=>x.contact_id===contact.id)?.progress).toMatchObject({done:2,total:2,percent:100});
    expect((await read('/api/contacts/' + contact.id + '/courses'))[0].completed_at).toBeTruthy();
  }, 120000);
});

describe('REACH: workflows are internal and non-publishing', () => {
  it('runs tag/wait/tag and a local task with no outbound integration', async () => {
    const contact=await post('/api/contacts',{
      email:'reach-workflow-target@example.invalid',first_name:'Workflow',last_name:'Synthetic'
    });
    const flow=await post('/api/workflows',{
      name:'REACH internal-only synthetic workflow',
      trigger:{type:'contact.tag_added',config:{tag:'never-use-trigger-for-this-test'}},
      steps:[
        {type:'add_tag',tags:['reach-entered']},
        {type:'wait',amount:1,unit:'days'},
        {type:'add_tag',tags:['reach-completed']},
        {type:'create_task',title:'Reach synthetic internal task'}
      ]
    });
    await patch('/api/workflows/' + flow.id,{status:'active'});
    const start=await post('/api/workflows/' + flow.id + '/enroll',{contact_ids:[contact.id]});
    expect(start.enrolled).toBe(1);
    let runs=await read('/api/workflows/' + flow.id + '/runs');
    expect(runs.runs[0].status).toBe('waiting');
    let stored=await read('/api/contacts/' + contact.id);
    expect(stored.tags).toContain('reach-entered');
    expect(stored.tags).not.toContain('reach-completed');
    t.app.db.run('UPDATE workflow_runs SET next_run_at = ? WHERE id = ?',
      new Date(Date.now()-1000).toISOString(), runs.runs[0].id);
    await t.app.tick();
    runs=await read('/api/workflows/' + flow.id + '/runs');
    expect(runs.runs[0].status).toBe('completed');
    stored=await read('/api/contacts/' + contact.id);
    expect(stored.tags).toContain('reach-completed');
    const tasks=await read('/api/tasks');
    expect(tasks.filter((x:any)=>x.title==='Reach synthetic internal task')).toHaveLength(1);
    expect(outbound).toHaveLength(1); // only the synthetic LMS member login link above
    await t.app.tick();
    const once=await read('/api/tasks');
    expect(once.filter((x:any)=>x.title==='Reach synthetic internal task')).toHaveLength(1);
  }, 120000);
});

describe('REACH: client workspace isolation and authorization', () => {
  it('rejects cross-workspace record IDs and member attempts to switch clients', async () => {
    const primary=t.api.location;
    const secondary=(await post('/api/locations',{name:'REACH isolated client B'})).id;
    t.api.setLocation(secondary);
    const bContact=await post('/api/contacts',{
      first_name:'TenantB',email:'tenant-b-private@example.invalid'
    });
    const bSite=await post('/api/funnels',{name:'Client B private funnel',template:'blank'});
    const bCourse=await post('/api/courses',{title:'Client B private course',empty:true});
    const bFlow=await post('/api/workflows',{
      name:'Client B private workflow',
      trigger:{type:'contact.tag_added',config:{tag:'synthetic-only'}},
      steps:[{type:'add_tag',tags:['B-only']}]
    });
    t.api.setLocation(primary);
    for(const path of [
      '/api/contacts/' + bContact.id,
      '/api/funnels/' + bSite.id,
      '/api/courses/' + bCourse.id,
      '/api/workflows/' + bFlow.id
    ]){
      expect((await t.api.get(path)).status,path).toBe(404);
    }
    expect((await t.api.patch('/api/funnel-pages/' + bSite.pages[0].id,
      {blocks:[{id:'malicious-edit',type:'hero',heading:'cross-tenant write'}]})).status).toBe(404);
    expect((await t.api.post('/api/courses/' + bCourse.id + '/lessons',
      {module_id:'fake',title:'cross-tenant lesson'})).status).toBe(404);
    expect((await t.api.post('/api/workflows/' + bFlow.id + '/enroll',
      {contact_ids:[bContact.id]})).status).toBe(404);

    const user=await post('/api/users',{
      email:'member-reach-a@example.invalid',name:'Synthetic A Member',
      password:'synthetic-member-pass-1',locations:[primary],
      permissions:['contacts','funnels','courses','workflows']
    });
    expect(user.role).toBe('member');
    const login=await t.api.raw('/api/auth/login',{
      method:'POST',headers:{'content-type':'application/json','x-pghl':'1'},
      body:JSON.stringify({email:'member-reach-a@example.invalid',password:'synthetic-member-pass-1'})
    });
    expect(login.status).toBe(200);
    const memberCookie=login.headers.get('set-cookie')?.split(';')[0];
    expect(memberCookie).toBeTruthy();
    for(const [method,path,body] of [
      ['GET','/api/contacts',undefined],
      ['GET','/api/funnels',undefined],
      ['GET','/api/courses',undefined],
      ['GET','/api/workflows',undefined],
      ['POST','/api/contacts',{first_name:'Should never be created'}]
    ] as const){
      const r=await t.api.raw(path,{
        method,headers:{
          cookie:memberCookie!,
          'x-location-id':secondary,
          'x-pghl':'1','content-type':'application/json'
        },
        body:body===undefined?undefined:JSON.stringify(body)
      });
      expect(r.status,method+' '+path+' should not authorize tenant B').toBe(403);
    }
    t.api.setLocation(secondary);
    const bAfter=await read('/api/funnels/' + bSite.id);
    expect(JSON.stringify(bAfter.pages[0].blocks)).not.toContain('cross-tenant write');
    expect((await read('/api/contacts/' + bContact.id)).email).toBe('tenant-b-private@example.invalid');
    t.api.setLocation(primary);
  }, 120000);
});
