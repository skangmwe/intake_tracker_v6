# Architecture — index

| Artifact | Purpose |
|---|---|
| [`data-model.md`](data-model.md) | Entities, relationships, PII/audit constraints, escalation-bridge DB view, index plan. |
| [`api-contracts.md`](api-contracts.md) | Endpoints, DTOs, error contract (RFC 7807), pagination, firm error codes, R2 deferrals. |
| [`module-boundaries.md`](module-boundaries.md) | 22 modules — what each owns, exposes, deliberately doesn't know. Layer rules (web → api → db). |
| [`shared-types.md`](shared-types.md) | Index of the TypeScript vocabulary at `/shared/types/`. |
| [`dependency-graph.md`](dependency-graph.md) | Module dependency graph. Topological ordering. Acyclicity check. |
| [`shared-inventory.md`](shared-inventory.md) | Every cross-cutting utility, UI primitive, and infra helper. Location, consumers, scaffold status. |
| [`slice-plan.md`](slice-plan.md) | The 24-slice Release 1 build plan. LoC ceiling, drift cap, screen coverage. |
| [`scaffold-notes.md`](scaffold-notes.md) | Decisions and gaps recorded during scaffold. Reviewer checklist. |

## Source-of-truth ordering

1. **The prototype** — `artifacts/docs/design/project/AI Solutions Tracker.dc.html` — wins for prototyped screens (per `.claude/rules/design/README.md`).
2. **The build spec** — `artifacts/docs/dev/ai_solutions_tracker_build_spec_final.md` — the canonical spec for objects, fields, workflow, escalation, permissions, reporting, phasing.
3. **The requirements** — `artifacts/docs/product/solution-requirements.md` — intent (why, who, sensitivity, tier, constraints, approvals, timeline).
4. **The blueprint** — `artifacts/docs/design/full-design-blueprint.md` — reconciled screen map, save-for-/build screen specs, role/access matrix.
5. **These architecture artifacts** — the "how" for what the slices build.

## Slice log

Implemented slices, in order. Links the `slice-plan.md` row and any slice doc.

| # | Slice | Status | Plan | Slice doc |
|---|---|---|---|---|
| 1 | Foundation | completed | [slice-plan.md §Slice 1](slice-plan.md) | [01-slice-foundation.md](01-slice-foundation.md) |
| 2 | Auth & app shell | completed | [slice-plan.md §Slice 2](slice-plan.md) | [02-slice-auth-app-shell.md](02-slice-auth-app-shell.md) |
| 3 | Fields & objects — schema engine | completed | [slice-plan.md §Slice 3](slice-plan.md) | [03-slice-fields-schema-engine.md](03-slice-fields-schema-engine.md) |
| 4 | Lifecycle & gates admin (S31) | completed | [slice-plan.md §Slice 4](slice-plan.md) | [04-slice-lifecycle-gates-admin.md](04-slice-lifecycle-gates-admin.md) |
| 5 | Requests — create, list, detail, edit (S2/S3/S4/S26) | completed | [slice-plan.md §Slice 5](slice-plan.md) | [05-slice-requests-core.md](05-slice-requests-core.md) |
| 6 | Similar-requests nudge + Comments & activity thread | completed | [slice-plan.md §Slice 6](slice-plan.md) | [06-slice-similar-comments.md](06-slice-similar-comments.md) |
| 7 | Tasks (S4/S5 Tasks & gates — tasks section) | completed | [slice-plan.md §Slice 7](slice-plan.md) | [07-slice-tasks.md](07-slice-tasks.md) |
| 8 | Gates on records + Approvals (S4/S5 gate section) | completed | [slice-plan.md §Slice 8](slice-plan.md) | [08-slice-gates-approvals.md](08-slice-gates-approvals.md) |
| 9 | Escalation bridge (S5 escalated variant + S18 modal) | completed | [slice-plan.md §Slice 9](slice-plan.md) | [09-slice-escalation.md](09-slice-escalation.md) |
| 10 | Closure, Copy, Re-pursuit + Typed links (S4/S5 + S19) | completed | [slice-plan.md §Slice 10](slice-plan.md) | [10-slice-closure-copy-links.md](10-slice-closure-copy-links.md) |
| 11 | Attachments (S4/S5 Attachments tab) | completed | [slice-plan.md §Slice 11](slice-plan.md) | [11-slice-attachments.md](11-slice-attachments.md) |
| 12 | Watchers + Notifications (S20 bell + Watchers & alerts tab) | completed | [slice-plan.md §Slice 12](slice-plan.md) | [12-slice-watchers-notifications.md](12-slice-watchers-notifications.md) |
| 13 | Announcements (S21 detail + S22 list + S23 manage + bell deep-link) | completed | [slice-plan.md §Slice 13](slice-plan.md) | [13-slice-announcements.md](13-slice-announcements.md) |
| 14 | Feature Catalog (S9/S10/S13) + Saved-view editor (S24 + S2 wiring) | completed | [slice-plan.md §Slice 14](slice-plan.md) | [14-slice-feature-catalog-saved-views.md](14-slice-feature-catalog-saved-views.md) |
| 15 | Search — top-bar quick search + S27 results | completed | [slice-plan.md §Slice 15](slice-plan.md) | [15-slice-search.md](15-slice-search.md) |
| 16 | CSV Import & Export (S28 + S2 Export button) | completed | [slice-plan.md §Slice 16](slice-plan.md) | [16-slice-import-export.md](16-slice-import-export.md) |
| 17 | Users & access admin (S29) | completed | [slice-plan.md §Slice 17](slice-plan.md) | [17-slice-users-access.md](17-slice-users-access.md) |
| 18 | Views & dashboards admin (S32 views half) + Workspace audit (S33) | completed | [slice-plan.md §Slice 18](slice-plan.md) | [18-slice-views-audit.md](18-slice-views-audit.md) |
| 19 | Platform admin (S35 crossing map · S36 access · S37 role labels · S39 firm-wide audit · S38 provisioning API) | completed | [slice-plan.md §Slice 19](slice-plan.md) | [19-slice-platform-admin.md](19-slice-platform-admin.md) |
| 20 | Error / empty edge states (S40 no-access · S41 zero-data · S42 filtered-to-zero) | completed | [slice-plan.md §Slice 20](slice-plan.md) | — (routine; decisions in the slice-plan note) |
| 21 | Current-date + date-difference primitive + SLA Status + time-in-stage (S2 aging tint · S4/S5 SLA pill + time-in-stage) | completed | [slice-plan.md §Slice 21](slice-plan.md) | [21-slice-sla-timeinstage.md](21-slice-sla-timeinstage.md) |
| 22 | Home surface (S1 — per-user landing: Needs your decision · Your work today · Since you were last here · New to triage · pinned strip · Pin-as-home) | completed | [slice-plan.md §Slice 22](slice-plan.md) | [22-slice-home.md](22-slice-home.md) |
| 23 | Seeded dashboards (S6 default · S14 Workload · S12 Feature Catalog · S17 list · S15 PG starter · S16 viewer · S32 mgmt) — widget-list-JSON + fixed metric resolvers | completed | [slice-plan.md §Slice 23](slice-plan.md) | [23-slice-dashboards.md](23-slice-dashboards.md) |
