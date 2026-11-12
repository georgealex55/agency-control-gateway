'use strict';
// REACH 2.2 STAGING ONLY: transport-independent, no server listener or external I/O.
// The public demo login is NOT an authenticated staging identity.
const {createTenantStore}=require('../data/schema.cjs');
const ID=/^[A-Za-z0-9_-]{1,80}$/;
function error(status,message){return {status,body:{error:message,source:'STAGING_SYNTHETIC'}};}
function createContactApi({sessions,db}={}){
 if(!sessions||typeof sessions.resolve!=='function'||typeof sessions.validCsrf!=='function'||!db||typeof db.query!=='function')throw new TypeError('Trusted session store and injected database required');
 return Object.freeze({async handle({method,token,tenantId,contactId,body,csrf}={}){
  if(!['GET','POST'].includes(method))return error(405,'Method not allowed');
  const session=sessions.resolve(token);
  if(!session)return error(401,'Authentication required');
  if(typeof tenantId!=='string'||!ID.test(tenantId)||session.tenantId!==tenantId)return error(403,'Forbidden');
  if(method==='POST'&&!sessions.validCsrf(token,csrf))return error(403,'CSRF validation failed');
  try{
   const store=createTenantStore(db,session);
   let result;
   if(method==='GET'){
    result=contactId===undefined?await store.listContacts(tenantId):await store.getContact(tenantId,contactId);
   }else{
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['id','displayName','phone','email'].includes(k)))return error(400,'Invalid contact payload');
    if(typeof body.phone!=='undefined'&&body.phone!==null&&(typeof body.phone!=='string'||body.phone.length>40))return error(400,'Invalid phone');
    if(typeof body.email!=='undefined'&&body.email!==null&&(typeof body.email!=='string'||body.email.length>254))return error(400,'Invalid email');
    result=await store.createContact(tenantId,body);
   }
   return {status:method==='POST'?201:200,body:{source:'STAGING_SYNTHETIC',connected:false,records:result.rows||[]}};
  }catch(e){
   if(e.code==='FORBIDDEN')return error(403,'Forbidden');
   if(e instanceof TypeError)return error(400,'Invalid contact input');
   if(e.code==='23505')return error(409,'Contact already exists');
   // Do not leak SQL, credentials or backend error details.
   return error(503,'Staging storage unavailable');
  }
 }});
}
module.exports={createContactApi};
