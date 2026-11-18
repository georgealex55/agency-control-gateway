# REACH 2.0 — 12-run staging shell implementation plan
Status: scoped build plan, not a completion claim. Prepared 2026-11-06. Owner-approved design: REACH 2.0 login and business command-center dashboard mockup (navy/purple/white), business status rather than a GHL-style CRM homepage.

## Hard limits
- Work ONLY on `experiment/gohyperlevel-synthetic-poc-20261104` or clearly named **staging** successor. Never push/merge main, publish production or change live client records. Never create Neon/Vercel/provider projects or incur costs.
- No live Google, messaging, voice, AI or external connectors required for usability. Use explicitly labeled **Demo / Sample data**. Never present simulated sends, calls, analytics or health probes as real.
- Preserve staging authorization, migration, contacts/pipelines, local workflow receipts, encrypted backup, synthetic outbox and existing tests. Avoid global refactors. Check existing tree/build before choosing shell directory; if no app exists at repo root, create a self-contained, runnable `reach-shell/` development app and document the startup command.
- Initial user is one business owner. Customer-owned deployment/Neon/storage and owner-provided AI keys are **connection setup placeholders**, not connected services.
- No inactive UI controls: every visible interactive control must navigate, change demo state, open functional content or be visibly disabled with “Connect to activate” guidance.

## Navigation and visual target
A working responsive sidebar with: **Dashboard**, **Inbox**, **Calls**, **Appointments**, **Business Presence**, **Contacts**, **Automations**, **Reports & Metrics**, **AI Assistant**, **Settings / Connections**, **Help & Setup**. Preserve active nav state, empty/demo/busy/error states, keyboard focus, and mobile navigation. Login/first-time demo onboarding should be viewable without real auth, prominently labeled demo; no pretending it is secure production authentication.

## Quantitative acceptance gates
- **Navigation:** all 11 menu destinations reachable, refreshable via distinct routes or durable screen state, including a way back; 11/11 passing.
- **Functional checklist:** test 24 specified interactions, with >=15 (62.5%) passing in a runnable developer demo, and label partial/disabled items honestly. A “function” requires an observed state change, persisted demo record, or verified navigation; decorative cards are not counted.
1. Demo login -> dashboard; 2. log out -> login; 3. first-time setup checklist progress; 4. persist/reload selected business profile; 5. dashboard date range selection; 6. dashboard metric/status drilldown; 7. dashboard action item acknowledge/resolve; 8. inbox conversation selection; 9. compose/save simulated reply with sent-vs-draft clarity; 10. inbox search/filter; 11. call history search/filter; 12. mark missed call for follow-up and create task; 13. adjust simulated forwarding/fallback policy; 14. business website status detail; 15. Google profile discrepancy -> suggested fix task; 16. appointments create; 17. appointments reschedule/cancel; 18. contacts create/edit; 19. contacts search; 20. automation rule enable/disable and simulated execution log; 21. metrics range/source selection; 22. assistant executes safe deterministic demo command (no AI API); 23. connections/status setup walkthrough and validation; 24. reset demo data or export JSON safely.
- **Quality:** Node/unit tests and app build/typecheck when toolchain is available; smoke tests for route navigation and 15 actions, mobile narrow viewport, no runtime exceptions, no “connected” badges for unavailable external providers. Report tests actually run and CI evidence or access blocks.
- **Outcome:** An immediately usable **developer demo shell**, not a production CRM, not functioning real telephony or Google integration. Persist mock state locally where safe; provide explicit data reset.

## Twelve distinct execution targets (each must inspect ledger + latest staging tree/CI, implement and validate a concrete incremental commit)
1. Audit branch, current runnable app location and CI; create or extend standalone shell with documented dev/start scripts; establish separate build ledger.
2. Login/demo mode, reusable responsive sidebar, all 11 reachable navigation screens, accessible mobile menu and route smoke tests.
3. Dashboard business health, status cards, key metrics, actionable alerts and trend demo datasets with drilldowns.
4. Unified Inbox using seeded synthetic conversations, search/filter, draft/simulated reply and clear audit trail.
5. Calls panel with synthetic missed-call log, callback task, demo AI answering policy and fallbacks; no external phone events.
6. Online Presence: website status, Google profile information/review alerts, discrepancies -> action tasks; no live Google claims.
7. Appointments create, edit/reschedule, cancel and linked simulated conversations; persistent demo state.
8. Contacts CRUD/search plus link contact profiles to inbox/calls and preserve prior Neon contacts backend prototype.
9. Automations/tasks: rule enable, safe simulation/queue with deduplication + log; reuse synthetic outbox principles.
10. Metrics & reports + deterministic demo assistant suggestions, source/freshness labels and guardrails; no fabricated real AI.
11. Setup/Connections/Settings, customer-owned Neon/storage/hosting/AI key placeholders (do not collect secrets into client mock state), update/help flows, responsive + accessibility fixes.
12. Stabilization: run build/tests, navigate all 11 menus, assess 24 functions and >=15 green, fix urgent regressions, issue **final numbered report** and preview/start instructions. Clearly separate passed, partial, unavailable, remaining provider work and release blockers.

## Required run ledger
`docs/audits/reach-shell-12-run-ledger-2026-11-06.md`: each scheduled execution adds ordinal, timestamp (UTC), starting & final staging SHA, changed files, runnable command, test/build/CI evidence, functions moved from partial to passing, pending blockers/skips and next action. If no source modification could be made, explicitly record why; do not claim a working feature.

## Final artifact
`docs/audits/reach-shell-12-run-final-report-2026-11-06.md`: numbered changelog with SHAs, working navigation matrix, objective acceptance checklist (24 actions), exact passing percentage, passed/failed/unverified tests, developer demo URL if available (not an invented link), startup steps, gaps from connectors and customer-owned deployment requirements. Do not claim 60% unless >=15/24 actions pass actual tests/smoke validation.

## Staging preview publishing (approved after Run 4)
- The standalone shell source of truth is `reach-shell/index.html`. The existing Next.js staging app can expose a **demo-only** preview by copying the same contents into `ghl-gpt-gateway/public/reach-demo/index.html` (Vercel URL path `/reach-demo/index.html`).
- **Every run that changes the shell must synchronize the mirrored static preview file on the staging branch before concluding**. Fetch the latest source at run end, update/create the mirror on the same branch, and compare contents; record the mirror commit. Do not modify production aliases, project settings or main.
- Verify the **preview** Git-linked build is `READY`; an environment build status alone does not prove browser routing works. Never treat this demo login as real authentication or call any external provider from the preview.
- Current deploy branch alias reported by Vercel: `agency-control-gateway-git-e874e5-georgealex1925-2750s-projects.vercel.app`; use `/reach-demo/index.html` only when a ready preview deployment includes the mirror. Link a specific deployment if alias status is uncertain.
