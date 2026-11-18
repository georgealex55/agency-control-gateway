'use strict';
// Staging-only connection readiness contract. No network, secrets, or dispatch.
const SERVICES=Object.freeze([
 {id:'neon',label:'Neon database',section:'Data Input & Imports',gate:'isolated-staging-branch',scope:'server-side database, tenant isolation'},
 {id:'google',label:'Google services',section:'Connected Services',gate:'owner-oauth',scope:'Gmail/Calendar/Business Profile read-only discovery'},
 {id:'meta',label:'Facebook & Instagram',section:'Connected Services',gate:'owner-oauth',scope:'approved Page and Professional account read-only discovery'},
 {id:'ai',label:'AI assistant',section:'API & Webhooks',gate:'server-secret',scope:'local draft generation only'},
 {id:'website',label:'Website',section:'Connected Services',gate:'domain-ownership',scope:'read-only website monitoring'},
 {id:'storage',label:'File storage',section:'Data Input & Imports',gate:'isolated-bucket',scope:'private object metadata and test objects only'}
].map(Object.freeze));
const SECTIONS=Object.freeze(['Data Input & Imports','Connected Services','API & Webhooks','Account & Permissions','Connection Health']);
function readiness(input={}){
 const authorized=input.authenticated===true&&input.owner===true&&input.workspace==='personal-staging';
 return SERVICES.map(s=>Object.freeze({id:s.id,label:s.label,section:s.section,scope:s.scope,
  status:authorized&&input.gates?.[s.id]===true?'ready-for-read-only-test':'blocked',
  reason:!authorized?'Secure owner session and isolated personal-staging workspace required':input.gates?.[s.id]!==true?s.gate:'Owner-approved test only',
  outboundEnabled:false,writeEnabled:false}));
}
function mayExecute(action,context={}){
 if(!context.authenticated||!context.owner||context.workspace!=='personal-staging')return false;
 if(action?.external===true||action?.write===true||action?.send===true||action?.publish===true)return false;
 return action?.kind==='read-only-test'&&context.explicitApproval===true;
}
module.exports={SERVICES,SECTIONS,readiness,mayExecute};
