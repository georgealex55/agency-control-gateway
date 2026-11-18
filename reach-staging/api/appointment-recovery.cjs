'use strict';
// REACH 2.3 staging-only appointment recovery. Never dispatches reminders.
const {randomUUID}=require('node:crypto');
const {assertTenantAccess}=require('../security/tenant-policy.cjs');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const UP=`
CREATE TABLE IF NOT EXISTS reach23_appointment_recovery (
 tenant_id text NOT NULL, id text NOT NULL, opportunity_id text NOT NULL,
 contact_id text NOT NULL, scheduled_at timestamptz NOT NULL,
 status text NOT NULL CHECK (status IN ('pending','confirmed','no_show','cancelled','rebooked')),
 prior_id text, actor_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,id),
 FOREIGN KEY (tenant_id,opportunity_id) REFERENCES reach23_opportunities(tenant_id,id),
 FOREIGN KEY (tenant_id,contact_id) REFERENCES reach22_contacts(tenant_id,id),
 FOREIGN KEY (tenant_id,prior_id) REFERENCES reach23_appointment_recovery(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS reach23_appointment_reminders (
 tenant_id text NOT NULL, id text NOT NULL, appointment_id text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('confirmation','rebooking')),
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,appointment_id,kind),
 FOREIGN KEY (tenant_id,appointment_id) REFERENCES reach23_appointment_recovery(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS reach23_appointment_status_idx ON reach23_appointment_recovery(tenant_id,status,scheduled_at);
`;
const DOWN='DROP TABLE IF EXISTS reach23_appointment_reminders;\nDROP TABLE IF EXISTS reach23_appointment_recovery;';
function invalid(){const e=new TypeError('Invalid synthetic appointment');e.code='INVALID_INPUT';throw e;}
function createAppointmentRecovery({db,session}={}){
 if(!db||typeof db.transaction!=='function'||!session||!Object.isFrozen(session))throw new TypeError('Trusted session and transaction adapter required');
 const check=(tenantId,action)=>assertTenantAccess({session,tenantId,action});
 const timestamp=value=>typeof value==='string'&&UTC.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
 return Object.freeze({
  async create(tenantId,{opportunityId,contactId,scheduledAt}={}){
   const actor=check(tenantId,'create');
   if(!ID.test(opportunityId||'')||!ID.test(contactId||'')||!timestamp(scheduledAt))invalid();
   return db.transaction(async tx=>{
    const opp=await tx.query('SELECT id FROM reach23_opportunities WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,opportunityId]);
    const contact=await tx.query('SELECT id FROM reach22_contacts WHERE tenant_id=$1 AND id=$2',[tenantId,contactId]);
    if(opp.rows.length!==1||contact.rows.length!==1){const e=new Error('Opportunity or contact not found');e.code='NOT_FOUND';throw e;}
    const id=randomUUID(),reminderId=randomUUID();
    await tx.query("INSERT INTO reach23_appointment_recovery (tenant_id,id,opportunity_id,contact_id,scheduled_at,status,actor_id) VALUES ($1,$2,$3,$4,$5,'pending',$6)",[tenantId,id,opportunityId,contactId,scheduledAt,actor.userId]);
    await tx.query("INSERT INTO reach23_appointment_reminders (tenant_id,id,appointment_id,kind) VALUES ($1,$2,$3,'confirmation')",[tenantId,reminderId,id]);
    return Object.freeze({id,reminderId,status:'pending',source:'STAGING_SYNTHETIC',connected:false,dispatched:false});
   });
  },
  async transition(tenantId,{appointmentId,action,scheduledAt}={}){
   const actor=check(tenantId,'update');
   if(!ID.test(appointmentId||'')||!['confirm','no_show','cancel','rebook'].includes(action)||(action==='rebook'&&!timestamp(scheduledAt)))invalid();
   return db.transaction(async tx=>{
    const prior=await tx.query('SELECT id,opportunity_id,contact_id,status FROM reach23_appointment_recovery WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenantId,appointmentId]);
    if(prior.rows.length!==1){const e=new Error('Appointment not found');e.code='NOT_FOUND';throw e;}
    const old=prior.rows[0], allowed={confirm:['pending'],no_show:['pending','confirmed'],cancel:['pending','confirmed'],rebook:['no_show','cancelled']};
    if(!allowed[action].includes(old.status)){const e=new Error('Invalid appointment transition');e.code='INVALID_TRANSITION';throw e;}
    if(action==='rebook'){
     const id=randomUUID(),reminderId=randomUUID();
     await tx.query("INSERT INTO reach23_appointment_recovery (tenant_id,id,opportunity_id,contact_id,scheduled_at,status,prior_id,actor_id) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)",[tenantId,id,old.opportunity_id,old.contact_id,scheduledAt,appointmentId,actor.userId]);
     await tx.query("UPDATE reach23_appointment_recovery SET status='rebooked' WHERE tenant_id=$1 AND id=$2",[tenantId,appointmentId]);
     await tx.query("INSERT INTO reach23_appointment_reminders (tenant_id,id,appointment_id,kind) VALUES ($1,$2,$3,'rebooking')",[tenantId,reminderId,id]);
     return Object.freeze({id,priorId:appointmentId,reminderId,status:'pending',source:'STAGING_SYNTHETIC',connected:false,dispatched:false});
    }
    const status={confirm:'confirmed',no_show:'no_show',cancel:'cancelled'}[action];
    await tx.query('UPDATE reach23_appointment_recovery SET status=$3 WHERE tenant_id=$1 AND id=$2',[tenantId,appointmentId,status]);
    if(status==='cancelled'||status==='no_show')await tx.query("UPDATE reach23_appointment_reminders SET status='cancelled' WHERE tenant_id=$1 AND appointment_id=$2 AND status='queued'",[tenantId,appointmentId]);
    return Object.freeze({id:appointmentId,status,source:'STAGING_SYNTHETIC',connected:false,dispatched:false});
   });
  }
 });
}
module.exports={UP,DOWN,createAppointmentRecovery};
