# fix-requests-board-view-50f6555 — iteration log

**Label:** fix-requests-board-view-50f6555
**Scope source:** uncommitted diff (fix/requests-board-view off dev 50f6555)
**Files reviewed:** 2 (web/src/features/requests/components/RequestsListPage.tsx + .test.tsx)
**Final status:** CLEAN (focused-equivalent verification; design-fidelity WAIVED by explicit developer decision)

## Scope

Re-adds the layout view-mode toggle to the Requests surface, scoped to **Table + Board**
only. The date/gallery layouts (Timeline / Agenda / Gallery) shipped in slice 24 and were
removed from Requests in `875ca66` as mis-scoped (prototype puts advanced views on
Dashboards). This change restores **only** Table + Board per an explicit product decision by
the analyst (skangmwe): Requests gets Table + Board; Timeline/Agenda/Gallery stay parked for
Dashboards. The shared `RecordViews` components are untouched (already in the codebase, still
used by FeatureCatalogPage).

Net diff vs. dev:
- `RequestsListPage.tsx`: import `KanbanView`/`ViewModeToggle`; `REQUEST_VIEW_KINDS =
  ['table','kanban']`; restore `slaBadges` / `toViewItem` (trimmed to board's needs, no
  `dateValue`) / `deriveStageOrder`; `viewMode` state; `layoutSlot` in the ViewBar; a
  table/board conditional in the grid body. Pagination and empty/loading/error states unchanged.
- `RequestsListPage.test.tsx`: +3 tests (toggle offers only Table+Board; switching to Board
  renders stage columns and drops the table + axe; a board card opens its record); +`within` import.

## Iteration 1 — 0 code findings, 0 security findings

### Deterministic / focused gates
- **tsc --noEmit:** 0 NEW errors from this change; the 11 pre-existing dev errors
  (announcements / audit / relationships) are unchanged and out of scope for this fix.
- **ESLint (changed files):** clean, exit 0.
- **Unit tests (RequestsListPage.test.tsx):** 22/22 pass, including the 3 new cases. The Board
  render state is axe-clean.
- **Token discipline:** `check-design-conformance.sh` times out in this git-bash env (known
  process-spawn limit — same as the slice-24 run). Ran the equivalent manual scan on the changed
  source: the diff adds **no** style files, **no** inline styles, and **no** raw hex/rgb/hsl —
  it only reuses existing `rv-*` classes and design tokens. PASS.

### Phase 1 — code review (focused, diff-only)
No Critical/High/Medium/Low findings. The restored helpers are pure and mirror the
previously-reviewed slice-24 code (trimmed to board scope). Named constant for the layout list;
descriptive identifiers; no magic numbers; no new dependencies. The page component was already
over the soft length ceiling before this change (pre-existing); this adds ~50 lines of the same
shape that previously passed review and is not a new violation class.

### Phase 2 — security review (focused, diff-only)
No findings. Presentation-only change: the board renders the same access-filtered `rows` the
table does (no widening of visibility — `ViewModeToggle` is a layout affordance), card `onOpen`
navigates to `/requests/:id` exactly as a table row click does. No SQL, no new data flow, no
auth surface, no `dangerouslySetInnerHTML`, no secrets, no new deps.

### Design fidelity — WAIVED (explicit developer decision)
The full render-and-compare matrix (stand up LocalDB + app, per-screen per-component screenshot
diff via sub-agents) is CI-scale and is not run in this environment. More importantly, this
change is a **deliberate divergence from the prototype**: the prototype shows no view-mode
toggle on Requests. The analyst (skangmwe) explicitly chose to ship Table + Board on Requests
and to waive the design-fidelity gate for this intentional divergence (see conversation
2026-07-21). Recorded as `component_coverage: "waived"` in the clean-run manifest — this is the
same waived-manifest path used for prior DCLogic-prototype divergences on this project. The
blueprint/prototype are NOT updated by this fix; if the divergence is later made canonical, the
prototype + blueprint should be updated to match.

## Final Status: CLEAN
- Total iterations: 1
- Findings fixed: 0 (none surfaced)
- Design-fidelity: WAIVED by developer decision (intentional prototype divergence)
