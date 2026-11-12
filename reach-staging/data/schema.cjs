'use strict';
// REACH 2.2 STAGING ONLY. SQL is a definition, never auto-executed.
// Use a dedicated, explicitly authorized staging migration connection.
// Tenant ID is mandatory on every table and repository operation.
const {withTenantRepository}=require('../security/tenant-policy.cjs');
const UP=`
CREATE TABLE IF NOT EXISTS reach22_contacts (
 tenant_id text NOT NULL, id text NOT NULL, display_name text NOT NULL,
 phone text, email text, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,id), CHECK (length(tenant_id)>0)
);
CREATE TABLE IF NOT EXISTS reach22_calls (
 tenant_id text NOT NULL, id text NOT NULL, contact_id text,
 direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
 outcome text NOT NULL CHECK (outcome IN ('missed','answered','voicemail')),
 occurred_at timestamptz NOT NULL, PRIMARY KEY (tenant_id,id),
 FOREIGN KEY (tenant_id,contact_id) REFERENCES reach22_contacts(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS reach22_tasks (
 tenant_id text NOT NULL, id text NOT NULL, contact_id text,
 source_call_id text, status text NOT NULL CHECK (status IN ('open','done','cancelled')),
 title text NOT NULL, PRIMARY KEY (tenant_id,id),
 FOREIGN KEY (tenant_id,contact_id) REFERENCES reach22_contacts(tenant_id,id),
 FOREIGN KEY (tenant_id,source_call_id) REFERENCES reach22_calls(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS reach22_appointments (
 tenant_id text NOT NULL, id text NOT NULL, contact_id text NOT NULL,
 scheduled_at timestamptz NOT NULL, status text NOT NULL CHECK (status IN ('scheduled','cancelled','completed')),
 PRIMARY KEY (tenant_id,id),
 FOREIGN KEY (tenant_id,contact_id) REFERENCES reach22_contacts(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS reach22_event_receipts (
 tenant_id text NOT NULL, event_key text NOT NULL, event_type text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,event_key)
);
`;
const DOWN=`
DROP TABLE IF EXISTS reach22_event_receipts;
DROP TABLE IF EXISTS reach22_appointments;
DROP TABLE IF EXISTS reach22_tasks;
DROP TABLE IF EXISTS reach22_calls;
DROP TABLE IF EXISTS reach22_contacts;
`;
const TABLES=Object.freeze(['reach22_contacts','reach22_calls','reach22_tasks','reach22_appointments','reach22_event_receipts']);
const ID=/^[A-Za-z0-9_-]{1,80}$/;
function createTenantStore(db,session){
 if(!db||typeof db.query!=='function')throw new TypeError('Injected database query adapter required');
 if(!session||!Object.isFrozen(session))throw new TypeError('Trusted frozen session required');
 function run(tenantId,table,action,sql,params=[]){
  if(!TABLES.includes(table)||!['read','create','update','delete'].includes(action))throw new Error('Unsupported repository operation');
  if(!Array.isArray(params))throw new TypeError('Parameter array required');
  return withTenantRepository(session,tenantId,action,scope=>db.query(sql,[scope.tenantId,...params]));
 }
 // No generic SQL is accepted from HTTP callers: only fixed parameterized queries.
 return Object.freeze({
  listContacts(tenantId){return run(tenantId,'reach22_contacts','read','SELECT id, display_name, phone, email FROM reach22_contacts WHERE tenant_id=$1 ORDER BY id');},
  getContact(tenantId,id){if(!ID.test(id||''))throw new TypeError('Invalid contact ID');return run(tenantId,'reach22_contacts','read','SELECT id, display_name, phone, email FROM reach22_contacts WHERE tenant_id=$1 AND id=$2',[id]);},
  createContact(tenantId,{id,displayName,phone=null,email=null}={}){
   if(!ID.test(id||'')||typeof displayName!=='string'||!displayName.trim()||displayName.length>200)throw new TypeError('Invalid contact');
   return run(tenantId,'reach22_contacts','create','INSERT INTO reach22_contacts (tenant_id,id,display_name,phone,email) VALUES ($1,$2,$3,$4,$5) RETURNING id,display_name,phone,email',[id,displayName.trim(),phone,email]);
  }
 });
}
module.exports={UP,DOWN,TABLES,createTenantStore};
