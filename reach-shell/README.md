# REACH 2.0 — Offline Staging Shell

This is an isolated, dependency-free developer demo. No real authentication, messages, phone calls, Google Business Profile or AI integrations are connected.

## Start

From the repository root, run `python3 -m http.server 8080 --directory reach-shell` then visit `http://localhost:8080`. Alternatively open `reach-shell/index.html` directly in a modern browser. No package install is needed.

Use **Enter demo dashboard** to enter the sample owner workspace. All 11 sidebar destinations use URL hash navigation and can be refreshed. Dashboard priority tasks can be resolved/reopened, stored in browser localStorage. Exit demo clears the tab's demo login, not sample data. Browser storage is not an authentication or production persistence mechanism.

Mobile: use **Menu** to open the sidebar. Do not use real business credentials or customer data.

## Known limitations

Only the initial runnable shell, navigation, demo login, sample dashboard and action toggles exist. Other screens are clearly marked as previews; no external connectors or backend services are integrated. Run 2 adds dedicated navigation and login tests. Production deployment is prohibited.
