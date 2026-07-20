# Design-fidelity — fix-requests-remove-viewmodes-997638a

**Scope:** `web/src/features/requests/components/RequestsListPage.tsx` (+ its test). Only **S2 (Requests list)** is affected by this diff; S3/S4/S31/APP/SHELL and the 18 not-implemented screens are untouched and carry forward from the last CLEAN cache (slice-record-status-hold / slice-toolkit-object).

Prototype focal file: `artifacts/docs/design/project/AI Solutions Tracker.dc.html`. Build stood up locally via the local-testing stack (LocalDB `AiSolutionsTrackerDev`, dev-bypass auth, seeded). Per-component capture **waived** (DCLogic single-file prototype tags no app-composite components — systemic, `#render-failed` Deferred); screen-level render-and-compare ran.

## Iteration 1

### S2 — /requests — **match** (view-mode drift RESOLVED)

- **prototype_shot:** `reviews/shots/S2-proto.png` (CDP click-nav `--clicks "Requests"`)
- **build_shot:** `reviews/shots/S2-build.png` (URL `http://localhost:5173/requests`)
- **Verdict:** `match`.

This slice removes the Table/Board/Timeline/Agenda `ViewModeToggle` from the Requests toolbar. Render-and-compare confirms the prototype's Requests toolbar shows exactly **saved-view picker ("All open requests · DEFAULT · SHARED") + Export view + Create request** — **no view-mode control**. The build toolbar, after this change, now shows the **same three controls**. The toolbars match.

This **resolves** the previously-Deferred finding `design-fidelity//requests::S2/view-mode-toggle` (the toggle was added in the advanced-views slice and recorded as `visual-drift` because it was absent from the prototype). Ledger row flipped `Deferred → Applied` in `architectural-findings.md`; removed from `deferred-architectural.md`.

Remaining S2 differences are **seed data, not design**: build shows 3 rows (LIT-9004/5/6) vs prototype mock 18 rows (REQ-000xxxx); avatar initials differ (dev-bypass user vs prototype mock). Not design drift.

### Carried forward (untouched by this diff — Deferred cross-slice, non-blocking)

- **S3** /requests/new — `visual-drift` (intake field order/labels), Deferred (requests-core slice).
- **S4** /requests/:recordId — `visual-drift` (tab order, SLA/history blocks, section-pill colour), Deferred (slices 5/9/21).
- **S31** /admin/lifecycle — `visual-drift` (picker shape, sub-nav label), Deferred (lifecycle-admin slice).
- **APP / SHELL** — `match`.
- 18 Prototype-tagged screens with blank App-route — `not-implemented` (render-exempt, out of scope).

**No new open design-fidelity findings.** The one screen this diff touches (S2) now matches the prototype.
