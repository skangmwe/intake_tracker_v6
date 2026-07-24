# fix-date-format-locale — design-fidelity render & compare

**Scope source:** git diff HEAD (uncommitted) · frontend-only (date-formatting)
**Prototype:** `artifacts/docs/design/project/AI Solutions Tracker.dc.html` (DCLogic single-file)
**Local stack:** web :5173 (this worktree) · API :5080 (reused, backend unchanged) · proto :8099

## Iteration 1

In-scope prototyped screens = those with a populated App-route in the blueprint master table
(S2 `/requests`, S3 `/requests/new`, S4 `/requests/:recordId`, S31 `/admin/lifecycle`). The other
18 Prototype-tagged screens carry a blank App-route → `not-implemented` / out-of-scope per the
per-slice scope rule. Component-level computed diffs are `component_coverage: "waived"` (standing
`design-fidelity/GATE#render-failed` — the DCLogic single-file prototype cannot be component-enumerated).

| Screen | Route | Verdict | Notes |
|---|---|---|---|
| S2 | `/requests` | **match** | Columns, layout, saved-view toolbar, aging tint, pagination all match the prototype. The Requests list has **no date column**, so this slice does not touch it. (Stage cell *values* differ — seeded "delivery" vocab vs the prototype's mock "Intake/Discovery/Build" — that is seed-vs-mock data content, not a layout/design drift.) |
| S3 | `/requests/new` | visual-drift (Deferred) | Carried cross-slice `S3/intake-field-order`. Intake form has no displayed calendar dates — this slice adds no drift here. |
| S4 | `/requests/:recordId` | visual-drift (Deferred) | **This slice's change.** Meta strip DUE DATE: prototype "10 Jul" → build **"09/01/2026"**; Intake tab SUBMITTED → build **"07/07/2026"** — locale-aware numeric mm/dd/yyyy with year. Deliberate, user-directed divergence (`S4/date-format-locale`). Also carries cross-slice `S4/record-detail-structure`. |
| S31 | `/admin/lifecycle` | visual-drift (Deferred) | Carried cross-slice `S31/lifecycle-picker-shape`. No dates on this screen — this slice adds no drift here. |

**Shots:** `.local-testing/shots-datefmt/S{2,3,4,31}-{build,proto}.png`.

**Result:** the only drift this slice introduces is the intended, user-directed date-format change on S4
(and every other date-bearing screen, which are out of render scope). Recorded as a Deferred finding.
No blocking design-fidelity findings. Design-conformance hook PASS (425 files, 0 raw-colour/radius violations).
