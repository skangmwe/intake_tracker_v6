# fix-s29-members-list-surface-c3f6e33 — design-fidelity

## Iteration 1

### Deterministic design-conformance gate — RAN, PASS
`check-design-conformance.sh --web-required` → **PASS** (tokens only; the new/changed styles —
`users.css`, `sideNav.css`, `TableShell` grid template — use design tokens with no raw hex / off-spec
radii). The one deliberate vertical rule (the actions-column divider) uses `1px solid var(--border-light)`.

### Render-and-compare — build vs prototype (DCLogic single-file prototype)
Per this project's established path, per-component computed-diff capture is unobtainable for the Claude
Design DCLogic prototype (`enumerate-prototype-components.mjs` → 0 app components; `render-states.mjs`
cannot click-navigate the no-deep-link SPA). Used the validator's built-in `component_coverage:"waived"`
path: every in-scope prototyped screen (populated App-route in the blueprint) got both shots + a verdict +
a documented waiver; the 17 blank-App-route prototyped screens are `not-implemented` (render-exempt);
plus `APP` + `SHELL`. No validator weakening.

Local stack for the render: LocalDB `AiSolutionsTrackerDev` (66 migrations, 153 procs incl. the new
`usp_SetMemberSuspension`), API `:5080` (Development + DevBypass), web `:5173`, prototype `:8099`.

| Screen | Route | Verdict | Note |
|---|---|---|---|
| S2 Requests list | `/requests` | **match** | The shared `TableShell` gained a backward-compatible `flex` column flag (defaults to the old "last column flexes"); RequestsListPage sets no flag, so S2 renders identically to the prior ship. Saved-view picker + Export view + Create request + funnels + pagination all present. |
| S3 Intake form | `/requests/new` | visual-drift → **Deferred** | Pre-existing intake field-order/label drift (built in the requests-core slice). Unaffected by this change. |
| S4 Record detail | `/requests/:recordId` | visual-drift → **Deferred** | Pre-existing record-detail structure drift (section-header pills, Status-tab meta/SLA/history, tab order — built in slices 5/9/21). Unaffected by this change. |
| S31 Lifecycle & gates | `/admin/lifecycle` | visual-drift → **Deferred** | Pre-existing lifecycle card-picker-vs-select drift (built in the lifecycle-admin slice). This change WIDENS the settings shell (`SideNavLayout` full-canvas) — which moves the build TOWARD the prototype (settings run full-width there), so it introduces no new drift. |
| S29 Users & access | `/admin/users` | **match** | This change reconciled S29 to the prototype: access level as plain text (was a `<select>`), row actions in a kebab overflow menu (Edit details / Suspend member \| Reactivate / Remove from workspace; Cancel invitation on Invited), the shared list-surface (sortable + funnel-filtered columns, pagination footer), a fixed actions column with a divider, and full-canvas margins. Render-and-compare confirms it now matches the prototype's Users & access. |

### Coverage disclosure
- **checked:** design-conformance (tokens/radii) on all changed styles; screen-level render-and-compare
  (both shots) for every in-scope prototyped screen (S2/S3/S4/S31/S29) + APP + SHELL.
- **not_checked:** per-component / per-interaction-state computed-style diffs — **waived** (the DCLogic
  prototype cannot produce a per-component diff; documented in each waived entry).
- **least_confident:** none — the in-scope screens were rendered and compared; the drift screens
  (S3/S4/S31) carry pre-existing, already-Deferred cross-slice findings that this change does not touch.
