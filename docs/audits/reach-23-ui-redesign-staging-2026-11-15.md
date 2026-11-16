# REACH 2.3 — Owner-first UI redesign (staging only)
Date: 2026-11-15
Base staging HEAD: 7cb480fb71e07bd2e4147b3bcfab447d45537941
Successor branch: experiment/reach-23-ui-redesign-staging-20261115
Scope: existing Next.js gateway UI. The separate offline REACH shell is not modified.

## Owner selections
1D futuristic command center; 2D dark default/light toggle; 3E configurable REACH accent; 4D mixed bento widgets; 5C readable text; 6C smooth animations with reduced-motion override.
7D recent-feature discovery plus command search; 8D full navigation grouped by role; 9D unified owner command center; 10C resize/hide/reorder widgets per session; 11A all features labeled; 12D mobile-specific navigation.
13D Connections hub entry; 14C Social Studio account cards and settings retained; 15C unified inbox planned; 16D full CRM customer view planned; 17C dedicated AI workspace planned; 18D visual automation builder planned.
19D KPI, trend and AI insight features planned while existing internal insights remain functional; 20C priority action center as informational staging checklist; 21A missing features visibly disabled; 22A owner-only access; 23A REACH branding only; 24D staged coordinated implementation.

## Completed in this implementation
- Owner command center, 26-feature directory, six logical groups, keyboard Ctrl/Cmd+K search, responsive sidebar and mobile bottom navigation.
- Dark/light and violet/blue/emerald accents, bento widget order, hide, resize and restore controls.
- All existing workspace admin, Social Studio, platform studios, module governance, settings and GHL migration screens preserved with existing authorization.
- Deep links into the existing internal Social Connections, calendar, media and insight tabs.
- Status labels for staging, source-only, planned and disabled features. Every unavailable feature remains disabled; never fake connected accounts or business KPI data.
- Native Node source contract regression tests and branch-specific TypeScript / Next build workflow.

## Actual runtime status
| Feature | UI | Truth |
|---|---|---|
| Command center | Working display | Counts are directory entries only, not financial or social metrics |
| Workspaces | Existing screen | Requires owner sign-in |
| Social drafts, calendar, media, internal insights | Existing Social Studio tabs | Internal planning only; no external publishing |
| Social Connections | Existing status and readiness interface | Live developer app consent and credentials not yet verified |
| Neon Connections | Existing gated page | Storage/auth readiness varies; no provisioning |
| CRM, websites, funnels, automations, learning | Existing source catalog | Runtime not claimed connected |
| Calls, unified inbox, tasks, AI, reviews, external analytics | Disabled entries | Not operational |
| GHL migration | Disabled feature | No scanning or data migration |

## Safety and validation
All production/main, live customer data, OAuth keys, provider messaging, posting, and paid resources are untouched.
Existing administrator and workspace access checks are unchanged. No client-side storage of secrets, customer data or preferences. Theme/layout changes are in-session only.
The standalone offline shell and its public demo mirror remain byte-identical and unchanged.
Native source checks and CI builds do not prove user-facing browser/mobile behavior, real OAuth, PostgreSQL tenant isolation or social provider connectivity.

## Test commands
- From repo root: node --test tests/reach-23-ui-contract.test.mjs
- Under ghl-gpt-gateway: npm install --ignore-scripts --no-audit --no-fund
- Under ghl-gpt-gateway: npx tsc --noEmit
- Under ghl-gpt-gateway: npm run build

## Follow-on tasks
1. Fix any verified CI or compilation failures.
2. Test authenticated staging preview on desktop and mobile, keyboard focus and theme contrast.
3. Verify social tab deep links and independent workspace permissions in a browser.
4. Implement real CRM, AI workspace, inbox, calls and visual automation separately; their current menu presence must not be interpreted as deployed functionality.
5. Adapt the offline REACH demo to the new visual language only in a separately approved step, preserving its byte-identical mirror.
