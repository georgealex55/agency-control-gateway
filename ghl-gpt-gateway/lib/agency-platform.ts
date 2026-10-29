export type ModuleKey = "website"|"crm"|"social"|"lms"|"funnels"|"automation"|"analytics";
export type BillingState = "active"|"trial"|"unpaid"|"none";
export type TenantRole = "agency_owner"|"agency_admin"|"client_owner"|"client_editor"|"instructor"|"viewer";
export type ModuleGrant = { module:ModuleKey; approved:boolean; provisioned:boolean; billing:BillingState };
export type Tenant = { id:string; name:string; category:string; isExample:boolean; grants:ModuleGrant[] };
export const MODULES: {key:ModuleKey;title:string;description:string;upgrade:boolean}[] = [
  {key:"website",title:"Website Studio",description:"Pages, forms, domains & activity",upgrade:false},
  {key:"crm",title:"Customer Hub",description:"Leads, contacts and appointments",upgrade:false},
  {key:"social",title:"Social Planner",description:"Publishing and connected profiles",upgrade:false},
  {key:"lms",title:"Learning Studio",description:"Courses, students and progress",upgrade:true},
  {key:"funnels",title:"Funnels",description:"Landing pages and conversion paths",upgrade:true},
  {key:"automation",title:"Automations",description:"Approved follow-up templates",upgrade:true},
  {key:"analytics",title:"Social Intelligence",description:"Channel and campaign insights",upgrade:true}
];
function demoGrants(keys: ModuleKey[]): ModuleGrant[] {
  return MODULES.map(m=>({module:m.key,approved:keys.includes(m.key),provisioned:keys.includes(m.key),billing:keys.includes(m.key)?"active":"none"}));
}
export const SAMPLE_TENANTS: Tenant[] = [
  {id:"sample-web",name:"Website Business",category:"Website & scheduling",isExample:true,grants:demoGrants(["website","crm","social"])},
  {id:"sample-learn",name:"Learning Academy",category:"Courses & instruction",isExample:true,grants:demoGrants(["lms","crm"])},
  {id:"sample-market",name:"Marketing Studio",category:"Funnels & social",isExample:true,grants:demoGrants(["funnels","crm","social","analytics"])}
];
export function entitled(role:TenantRole|null, grant:ModuleGrant|undefined): boolean {
  return Boolean(role && grant?.approved && grant.provisioned && (grant.billing==="active" || grant.billing==="trial"));
}
export function canApprove(role:TenantRole|null):boolean {
  return role==="agency_owner" || role==="agency_admin";
}
