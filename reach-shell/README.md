# REACH 2.0 — Offline Staging Developer Demo

This is an isolated, dependency-free REACH Business Command Center shell with **fictional records only**. It is separate from existing staging CRM, database, security, and workflow experiments. No actual authentication, Google, phone, SMS, email, AI, Neon, hosting, or third-party provider connection is enabled.

## Start locally

From the repository root:

```sh
python3 -m http.server 8080 --directory reach-shell
```

Open **http://localhost:8080**. Alternatively open `reach-shell/index.html` in a modern browser.

## Public dummy login (demo-only)

- **Email:** `demo@reach.local`
- **Password:** `ReachDemo2026!`
- Click **Use demo credentials** to autofill, then **Enter demo dashboard**.
- Any other credential combination is rejected locally. This is **not security or production authentication**: the credentials are public in the HTML and the demo session is stored only in browser sessionStorage. Never use actual passwords or customer data.

## Available workflows

Eleven sidebar pages: Dashboard, Inbox, Calls, Appointments, Business Presence, Contacts, Automations, Reports & Metrics, AI Assistant, Settings / Connections, Help & Setup.

Locally test sample dashboard tasks and date ranges; synthetic inbox search, drafts, simulated replies; missed-call callbacks and fallback policy; website/Google sample discrepancies; appointments; contacts; deduplicated local automation receipts; fixture reports; deterministic assistant tasks; setup checklist, profile selection, JSON copy export and two-step reset. Changes persist in browser localStorage (`reach-demo-state`); **no sends or provider actions** occur.

On a narrow screen select **Menu** for the responsive sidebar. The sidebar supports keyboard focus and Escape-to-close. **Exit demo** clears the session login but retains demo records. **Settings / Connections → Reset demo data** resets local sample records.

## Tests and acceptance

- Source smoke tests: `node --test reach-shell/shell.test.cjs`
- Functional acceptance exercise: `node --test reach-shell/acceptance.test.cjs`
- Run all: `node --test reach-shell/*.test.cjs`
- The acceptance harness uses simulated DOM events, **not an independent browser engine**. A real browser/mobile smoke test, including network/privacy review, is required before external release.
- Final numbered report: `docs/audits/reach-shell-12-run-final-report-2026-11-06.md`

## Staging-only preview

The shell is mirrored to `ghl-gpt-gateway/public/reach-demo/index.html` on `experiment/gohyperlevel-synthetic-poc-20261104` and is served at `/reach-demo/index.html` on a **READY staging branch deployment**. Do not merge this demo authentication into the production portal or deploy production without separate approval.

The working shell is not yet a customer-ready application: owner auth, persistent backend isolation, connection setup and live monitoring/communications are separate future phases.
