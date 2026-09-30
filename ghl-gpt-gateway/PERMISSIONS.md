# HighLevel authentication and scope model

The gateway uses two HighLevel auth layers:

- **Agency Private Integration Token (PIT)** for agency-level discovery such as listing locations.
- **Marketplace OAuth Location sessions** for sub-account APIs such as workflows, funnels/pages, blogs, Social Planner and location-scoped writes.

The Marketplace app is configured as a **Sub-account-targeted app**, installable by the Agency with bulk installation enabled. The Agency OAuth installation is stored encrypted, then exchanged for Location OAuth sessions for installed sub-accounts.

## Core CRM
- `locations.readonly`
- `contacts.readonly`
- `contacts.write`
- `opportunities.readonly`
- `opportunities.write`
- `conversations.readonly`
- `conversations.write`
- `conversations/message.readonly`
- `conversations/message.write`

## Social Planner
- `socialplanner/account.readonly`
- `socialplanner/account.write`
- `socialplanner/post.readonly`
- `socialplanner/post.write`
- `socialplanner/category.readonly`
- `socialplanner/category.write`
- `socialplanner/tag.readonly`
- `socialplanner/tag.write`
- `socialplanner/statistics.readonly`
- `socialplanner/oauth.readonly`
- `socialplanner/oauth.write`

## Blogs
- `blogs/list.readonly`
- `blogs/posts.readonly`
- `blogs/post.write`
- `blogs/post-update.write`
- `blogs/check-slug.readonly`
- `blogs/category.readonly`
- `blogs/author.readonly`

## Workflows
- `workflows.readonly`
- `contacts.write` for adding/removing a contact from a known workflow.

HighLevel's public workflow API exposes workflow retrieval/listing rather than CRUD editing of workflow definitions.

## Funnels / websites
- `funnels/funnel.readonly`
- `funnels/page.readonly`
- `funnels/pagecount.readonly`
- `funnels/redirect.readonly`
- `funnels/redirect.write`

The public Funnel API can discover funnels/pages and manage redirects. It does not expose full visual builder/page-content CRUD, so layout/text/design changes still require browser automation.

## Additional enabled modules

The current Marketplace grant also includes broader location capabilities such as calendars, media, custom values/fields, tags, email builder, products, invoices, payments, Voice AI and other modules. The gateway only exposes operations that are explicitly routed or allowlisted; having a scope does not by itself make an operation callable.

## Safety boundary

Delete/remove operations remain blocked unless both conditions are true:

```
ALLOW_DESTRUCTIVE_ACTIONS=true
confirmDestructive=true
```

Marketplace OAuth tokens and Location tokens are encrypted at rest and are never returned by gateway diagnostic endpoints.
