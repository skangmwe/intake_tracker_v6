# Design-fidelity findings — slice-multi-lifecycle-picker-3e6e19b

Render-and-compare (build vs the DCLogic prototype `AI Solutions Tracker.dc.html`) for the 4 in-scope
served screens (populated App-route): **S2, S3, S4, S31**. Screen-level render ran for every one (both
shots under `reviews/shots/`); per-component computed-diff is waived (`component_coverage:"waived"`) —
the DCLogic single-file prototype can't be enumerated per-component (see the committed ledger's
`design-fidelity/GATE::…#render-failed`). Cache: `reviews/.last-clean-run.json` → `MANIFEST: VALID`.

## Iteration 1

Slice 27 changed **S3** (intake "Lifecycle" picker) and **S31** (lifecycle dropdown selector). Both of
its changes **move the build toward the prototype** and partially resolve pre-existing Deferred findings.

| Screen | Verdict | Slice-27 change (vs prototype) | Remaining drift |
|---|---|---|---|
| **S2** Requests list | `match` | none (unchanged) | Blueprint-specified view-mode toggle (Table/Board/Timeline/Agenda) — already Deferred `…S2/view-mode-toggle` (slice-24). |
| **S3** Intake (`/requests/new`) | `visual-drift` | **"Request type" → "Lifecycle"** label + hint + dropdown-of-names now **match the prototype** (partially resolves Deferred `…S3/intake-field-order`, which cited "leads with 'Request type'"). | (a) default-option marker "Standard AI build (default)" vs prototype "Default — Standard AI build" — **slice-27**, minor cosmetic, Deferred-accepted (consistent "(default)" marker matching the S31 prototype dropdown; the prototype is self-inconsistent S3 vs S31). (b) intake field order/set/labels — **pre-existing** (slice-5 data-driven form), already Deferred. |
| **S4** Record detail (`/requests/:recordId`) | `visual-drift` | none (unchanged) | Tab order (Attachments↔Tasks & gates) — slice-25; Time-in-stage meta — slice-21. Both **pre-existing**, already Deferred `…S4/record-detail-structure`. |
| **S31** Lifecycle & gates (`/admin/lifecycle`) | `visual-drift` | **chip-bar → native `<select>` dropdown** now **matches the prototype** (directly resolves the "card-picker … where the prototype uses a native `<select>`" part of Deferred `…S31/lifecycle-picker-shape`); dropped the request-type input (name = single label); subtitle matches. | Settings-shell chrome (title placement, "Saved" autosave indicator, "Manage announcements" vs "Announcements" sub-nav label) — **pre-existing** (slice-2 settings shell), already Deferred. |

**Net:** slice 27's own surfaces match the prototype. All remaining drift is pre-existing cross-slice
structure already Deferred in `reviews/architectural-findings.md` (lines for S2/S3/S4/S31 + the
render-failed gate), so it is **non-blocking**. The one slice-27-introduced item (S3 default-option
marker format) is a minor cosmetic recorded as a Deferred-accepted discrepancy in the cache.

Shots: `reviews/shots/{S2,S3,S4,S31}-{proto,build}.png`, `APP-build.png`.
