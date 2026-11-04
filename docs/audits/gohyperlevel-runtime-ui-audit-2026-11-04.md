# GoHyperLevel pinned runtime + visual audit — November 4, 2026

## Evidence and scope

- Original upstream GitHub commit: `BAISESYSTEMS/GoHyperLevel@24ea786b85c3240ae4f24dcad6f657749730c56e`.
- Isolated GitHub Actions workflow: https://github.com/georgealex55/agency-control-gateway/actions/runs/41928291924
- Screenshot artifact: https://github.com/georgealex55/agency-control-gateway/actions/runs/41928291924/artifacts/13369978835
- Test environment: Ubuntu GitHub-hosted runner, local Docker image built from original source, temporary SQLite data volume, random synthetic administrator. No external integrations or customer accounts.
- Browser: headless Chromium, 1440x900 desktop and 390x844 mobile, with first-run onboarding dismissed before screenshots.
- This report reviews actual module list/dashboard screenshots, API calls and four simple synthetic CRUD journeys. It does **not** demonstrate editing pages/course lessons or executing workflows.

## Verified by the dedicated Docker/browser job

| Test | Evidence | Result |
|---|---|---|
| Original Docker image | Pinned source build on GitHub Actions | PASS |
| Health and version | GET /healthz, GET /api/version | HTTP 200 / HyperLevel |
| Anonymous access denied | GET /api/contacts without session | HTTP 401 |
| Synthetic admin login | POST /api/auth/login with ephemeral test-only identity | HTTP 200 |
| Authenticated listings | GET /api/contacts, /api/pipelines, /api/funnels, /api/courses, /api/workflows, /api/calendars | All HTTP 200 |
| CRM | Create synthetic contact and GET its saved ID | Both HTTP 200 |
| Website/funnel | Create synthetic funnel and GET its saved ID | Both HTTP 200 |
| Learning | Create synthetic course and GET its saved ID | Both HTTP 200 |
| Workflow | Create **inactive** synthetic workflow and GET its saved ID | Both HTTP 200 |
| Browser pages | Dashboard, Contacts, Opportunities, Funnels, Courses, Workflows, Social | All HTTP 200, React mounted, no reported uncaught browser errors |
| Mobile | Dashboard, Funnels, Courses at 390px | Zero measured document-level horizontal overflow |

Reported by `audit-summary.json`: `onboardingDismissals=1`, `warnings=[]`, ten screenshots and eight synthetic CRUD/read-back operations.

## Visual findings from the screenshots

1. **Navigation is comprehensive but dense.** The sidebar provides useful shortcuts to core agency services (Dashboard, Contacts, Opportunities, Automations, Funnels, Forms), while many other modules remain under More. Agency Control's single-administrator workflow should favor a smaller unified primary navigation and contextual secondary tools.
2. **First-run onboarding obscures the entire dashboard.** The original capture showed the large 'What do you want to do?' modal covering every page until dismissed. The second audit explicitly clicked Later once, allowing all subsequent real module screenshots. This is expected first-run behavior, but a visual audit must always dismiss it first.
3. **Mixed-language initial experience.** At an English-locale browser, the onboarding dialog had English headings and instructions interspersed with German tutorial copy ('In 10 Minuten startklar', 'Academy starten'). A default English agency implementation should verify consistent translation across onboarding and module labels.
4. **Mobile application avoids horizontal scrolling in tested views.** The 390px screenshots use a hamburger header, bottom five-item navigation and one-column content. However, the Funnels & websites header appears truncated to 'Funnels ...' next to action buttons; prioritize clearer title/action hierarchy on narrow screens.
5. **Initial module lists are legible and show real synthetic records.** Contacts displays the created lead, Funnels shows the created two-page landing page, Courses shows the draft course and its module/lesson counts, and Automations shows the created draft workflow. The Social Planner explicitly requires Postiz before any account connections or scheduling.
6. **The tested desktop pages leave substantial whitespace** with one sample record; not a defect by itself, but Agency Control should evaluate more useful empty states and informative panels for single-admin agency work.
7. **No editor detail was tested.** A populated index and successful create API do not establish drag-and-drop site editing, prompt-to-section quality, quiz/teacher capabilities, a working visual workflow canvas or publishing safety.

## Separate upstream source validation

The same run contains a separate upstream `npm ci`, `npm run typecheck`, full `npm test`, and `npm run build` job. **Do not mark that job passed until GitHub Actions reports it completed successfully.** Its result is separate from the successful Docker/browser job.

## Next audit gates

- Create/edit/save/preview one actual funnel page and inspect its editor at desktop/mobile sizes.
- Create course modules and lessons through the UI, enroll one test learner, record progress and inspect the learner portal.
- Test a workflow trigger, conditions and one safe internal step without sending email/SMS or invoking external services; validate execution logs and errors.
- Prove cross-workspace data isolation, admin-only permissions, backup/restore and SQLite recovery under restart.
- Determine whether GoHyperLevel's builder/LMS/workflow UX can replace Frappe/Activepieces without losing core teaching or integration capabilities.
- Separately deploy a test Postiz and evaluate real social OAuth only after approved Meta test credentials; do not activate publishing during this audit.

## Decision

**Continue as an isolated proof of concept; do not migrate.** GoHyperLevel has a real working Node/Docker runtime and basic CRM, funnel, course and workflow data operations, but external integrations, full authoring journeys, tenant security, performance and long-duration reliability are still unproven. Keep Agency Control Vercel/Neon and the existing five original engine targets untouched.

Workflow source: `.github/workflows/gohyperlevel-poc.yml`; browser smoke: `audit/gohyperlevel/visual-smoke.mjs`. Screenshots and `audit-summary.json` are available in the linked GitHub Actions artifact for the workflow retention period.