/** Immutable source-level evidence for GoHyperLevel; not a runtime approval. */
export const GOHYPERLEVEL_REPO="BAISESYSTEMS/GoHyperLevel";
export const GOHYPERLEVEL_SHA="24ea786b85c3240ae4f24dcad6f657749730c56e";
export const GOHYPERLEVEL_AUDITED="2026-11-04";
export type AuditArea={id:string;name:string;original:string;candidate:string;finding:string;unverified:string;evidence:readonly string[]};
export const GOHYPERLEVEL_AREAS:readonly AuditArea[]=[
 {id:"crm",name:"CRM + pipelines",original:"Frappe CRM",candidate:"Native modules",finding:"Contact and deal pipeline implementations plus API tests found.",unverified:"Lead journeys, tenant permissions, duplicates and imports.",evidence:["server/modules/contacts.ts","server/modules/pipelines.ts","tests/api.test.ts"]},
 {id:"builder",name:"Websites + funnels",original:"Frappe Builder",candidate:"Native page engine",finding:"Site renderer, block-based layout, brand styles and AI page tools found.",unverified:"Editor usability, prompt-to-section, mobile/SEO/domain behavior.",evidence:["server/modules/funnels.ts","server/modules/site-design.ts","server/services/site-layout.ts","server/modules/site-ai.ts"]},
 {id:"lms",name:"Courses + learning",original:"Frappe Learning",candidate:"Native course engine",finding:"Course, lesson, enrollment and learner portal logic found.",unverified:"Teacher UX, quizzes, progress, grading and certificates.",evidence:["server/modules/courses.ts","server/services/courses.ts"]},
 {id:"workflows",name:"Workflow automation",original:"Activepieces",candidate:"Native workflow engine",finding:"Triggers, step execution and visual workflow layout found.",unverified:"Long waits, retries, integration breadth and safe execution.",evidence:["server/modules/workflows.ts","server/services/workflow-engine.ts","server/modules/workflow-canvas.ts"]},
 {id:"social",name:"Social scheduling",original:"Postiz",candidate:"GoHyperLevel + Postiz",finding:"Publishing, OAuth and scheduling are delegated to external Postiz.",unverified:"Real connected account, media, provider APIs and scheduling.",evidence:["server/modules/social.ts","server/services/postiz.ts"]},
 {id:"booking",name:"Calendar + booking",original:"Separate scheduling",candidate:"Native booking",finding:"Calendar and appointment handlers found.",unverified:"Time zones, provider connection, conflict prevention.",evidence:["server/modules/calendars.ts","server/modules/calendar-view.ts"]},
 {id:"inbox",name:"Inbox + messaging",original:"CRM + providers",candidate:"Native inbox",finding:"Conversation and channel modules found.",unverified:"Deliverability, provider keys, opt-outs and rate limits.",evidence:["server/modules/conversations.ts","server/modules/channels.ts"]},
 {id:"agent",name:"Agent + data operations",original:"Agency Control APIs",candidate:"Native REST/MCP + SQLite",finding:"REST/MCP and persistent Node/SQLite runtime found.",unverified:"Tenant scopes, backups/restore, security and concurrency.",evidence:["server/modules/mcp.ts","server/core/db.ts","docker-compose.yml"]}
] as const;
export const GOHYPERLEVEL_GATES=[
 "Pin the source SHA and run build, typecheck, tests and Docker health check.",
 "Run synthetic multi-workspace CRM, funnel, course and workflow end-to-end tests.",
 "Perform a hands-on UI review with mobile/editor screenshots and accessibility checks.",
 "Verify Postiz dependency and independent Meta account OAuth before any publishing.",
 "Test SQLite volume recovery, backup, API permissions and cross-workspace separation.",
 "Review AGPL-3.0 and approve any migration only after parity is demonstrated."
] as const;
export function hyperlevelEvidence(path:string):string{
 if(!GOHYPERLEVEL_AREAS.some(row=>row.evidence.includes(path)))throw Error("Unreviewed evidence path");
 return "https://github.com/"+GOHYPERLEVEL_REPO+"/blob/"+GOHYPERLEVEL_SHA+"/"+path;
}
