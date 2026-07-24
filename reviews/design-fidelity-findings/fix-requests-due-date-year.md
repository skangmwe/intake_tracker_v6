# fix-requests-due-date-year — design-fidelity render & compare

**Scope:** frontend-only, one-line follow-up to `fix/date-format-locale` — the Requests list **Due date**
column (`RequestsListPage.formatDue`) was still using a hand-rolled word-month `MONTHS` array missed in
the first sweep. Routed through the shared `formatDate`.

**Local stack:** web :5173 (this worktree) · API :5080 (reused) · proto :8099.

## Iteration 1

In-scope prototyped screens (populated App-route): S2 `/requests`, S3 `/requests/new`,
S4 `/requests/:recordId`, S31 `/admin/lifecycle`. Component diffs `component_coverage: "waived"`
(DCLogic prototype). 18 blank-App-route screens = not-implemented/out-of-scope; APP/SHELL = match.

| Screen | Verdict | Notes |
|---|---|---|
| S2 | visual-drift (Deferred) | **This fix.** The Due date column now renders numeric mm/dd/yyyy with year + aging suffix. Wide render confirms `06/01/2026 · overdue`, `06/30/2026 · overdue`, `07/10/2026 · overdue` (previously "1 Jun · overdue"). User-directed convention (`S2/due-date-format`); prototype word-month does not win. Default view otherwise structurally matches. |
| S3 | visual-drift (Deferred) | Carried `S3/intake-field-order`. No dates on this screen. |
| S4 | visual-drift (Deferred) | Carried `S4/date-format-locale` + `S4/record-detail-structure`. Unchanged by this fix. |
| S31 | visual-drift (Deferred) | Carried `S31/lifecycle-picker-shape`. No dates on this screen. |

**Shots:** `.local-testing/shots-due/S{2,3,4,31}-{build,proto}.png` + `S2-wide-build.png`.

**Result:** the only change is the intended, user-directed Due-date-format on S2 (Deferred). No blocking
findings. Design-conformance PASS.
