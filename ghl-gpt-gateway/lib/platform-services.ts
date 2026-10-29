export type PlatformServiceId="website"|"learning"|"crm"|"social"|"automation";
export type PlatformService = {
  id:PlatformServiceId;
  title:string;
  summary:string;
  upstream:string[];
  runtime:string;
  capabilities:string[];
  status:"source-pinned"|"deferred";
  deployment:"external";
};
export const PLATFORM_SERVICES:readonly PlatformService[]=[
  {
    id:"website",title:"Website Studio",summary:"Visual pages, reusable sections, forms, domain ownership and publishing.",
    upstream:["frappe/frappe","frappe/builder","frappe/frappe_docker"],
    runtime:"Frappe v16 + MariaDB + Redis + worker",status:"source-pinned",deployment:"external",
    capabilities:["Page/section editor","Asset library","Forms & appointments","Domain validation","Draft/preview/publish"]
  },
  {
    id:"learning",title:"Learning Studio",summary:"Structured courses, teachers, lessons, quizzes and students.",
    upstream:["frappe/frappe","frappe/lms","frappe/payments"],
    runtime:"Frappe v16 + Learning + Payments",status:"source-pinned",deployment:"external",
    capabilities:["Instructor workspace","Courses & lessons","Quizzes","Student progress","Certificates"]
  },
  {
    id:"crm",title:"Customer Hub",summary:"Contacts, lead pipelines, follow-ups and appointment workflows.",
    upstream:["frappe/frappe","frappe/crm"],runtime:"Frappe v16 + CRM",status:"source-pinned",deployment:"external",
    capabilities:["Contacts & leads","Deal pipeline","Contact activity","Tasks","Appointments"]
  },
  {
    id:"social",title:"Social Intelligence",summary:"Social scheduling, connected accounts, post metrics and campaign reporting.",
    upstream:["gitroomhq/postiz-app"],runtime:"Postiz + PostgreSQL + Redis + workers",status:"source-pinned",deployment:"external",
    capabilities:["Content calendar","Draft/approval flow","Social integrations","Analytics","Campaign summaries"]
  },
  {
    id:"automation",title:"Workflow Studio",summary:"Agency-approved automation recipes and AI-enabled follow-up.",
    upstream:["activepieces/activepieces"],runtime:"Activepieces + separate workers",status:"deferred",deployment:"external",
    capabilities:["Workflow recipes","Approvals","Rate limits","Audit trail","Usage metering"]
  }
] as const;
export function serviceById(id:string):PlatformService|undefined{return PLATFORM_SERVICES.find(s=>s.id===id);}
