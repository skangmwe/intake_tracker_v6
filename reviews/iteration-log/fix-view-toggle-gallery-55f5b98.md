# fix-view-toggle-gallery-55f5b98 — iteration log

**Label:** fix-view-toggle-gallery-55f5b98
**Scope source:** uncommitted diff (fix/view-toggle-gallery off dev 55f5b98)
**Files reviewed:** 14 (7 source + 5 test + 2 CSS; WorkspaceSwitcher.tsx excluded — see below)
**Final status:** CLEAN (focused-equivalent verification; design-fidelity WAIVED by developer decision)

## Scope

UI polish batch for the list-surface view controls, across Requests / Feature Catalog / Toolkit:
- **Icon-only view-mode toggle** moved to the right of the toolbar, beside the primary action,
  sized to the primary button height (`--control-h-btn` = 36px). New `iconOnly` variant on the
  shared `ViewModeToggle` (labels visually-hidden → accessible name kept, + hover tooltip); new
  right-side `trailingSlot` on `ViewBar`.
- **Canonical view order** enforced centrally in `ViewModeToggle` (table · kanban · timeline ·
  agenda · gallery), filtered to a surface's `available` — independent of the passed order.
- **Toolkit** switched from its bespoke Gallery/List toggle to the shared toggle (list → the shared
  `table`; `ToolkitList` is a table); removed its redundant "N items" count.
- **Non-table views load-all + full-page scroll, no pager.** Galleries (Feature Catalog, Toolkit)
  and the Board (Requests) drop the `TableFooter`, load the full set (up to the API max, 100), and
  use a `list-surface--flow` (document scroll) instead of the fixed-height internal scroll. The
  **table** view keeps its pager + in-list scroll.
- **Board shows all lifecycle stages.** Columns come from the default lifecycle's ordered stages
  (`useLifecycleConfig`), so every stage renders as a column (empty ones included), grouped by stage
  key but titled by **label** — so it is label-agnostic and will display "Closeout" automatically if
  the Closure→Closeout stage rename lands (that rename is NOT in the codebase/dev as of this ship;
  live API returns "Closure").

## Excluded from this slice
A stray uncommitted `WorkspaceSwitcher.tsx` change (removal of a `title` tooltip attr, 4 lines) was
found in the worktree — not part of this work, not in any stash/branch/primary. Saved to
`scratchpad/stray-workspaceswitcher-title-removal.patch` and the file restored to dev, so this slice
contains only the intended 14 files.

## Iteration 1 — 0 code findings, 0 security findings

### Deterministic / focused gates
- **tsc --noEmit:** 0 NEW errors; the 11 pre-existing dev errors (announcements/audit/relationships)
  are unchanged and out of scope.
- **ESLint (all 14 changed files):** clean, exit 0.
- **Unit tests:** full web suite **1386 passed / 245 suites / 0 failed** (`jest --ci`). Ran the full
  suite deliberately because shared components (`ViewModeToggle`, `ViewBar`) changed. New/updated
  cases: canonical order, `iconOnly` (+axe), `trailingSlot`, Toolkit shared-toggle + gallery-hides-
  footer, Feature-Catalog gallery-hides-footer, Requests board-shows-all-7-stages (+axe) and
  table-keeps-footer.
- **Token discipline:** `check-design-conformance.sh` times out in this git-bash env (known). Manual
  scan of every changed CSS line: **zero raw hex/rgb/hsl/named-colours, zero off-spec radii.** The
  only new raw value is `--control-h-btn: 36px` in the token override file `mws/tokens.css` (the
  sanctioned place; mirrors `.mws-btn` height) — consumed via `var(--control-h-btn)`. PASS.

### Phase 1 — code review (focused, diff-only)
No Critical/High/Medium/Low. Named constants for page sizes (`BOARD_PAGE_SIZE`, `GALLERY_PAGE_SIZE`
= 100, the API max) and the canonical `KIND_ORDER`; descriptive identifiers; exhaustive-deps kept;
no new dependencies; `data-ds` handles preserved on the shared toggle. Feature Catalog untouched by
the Toolkit refactor (both consume the shared components).

### Phase 2 — security review (focused, diff-only)
No findings. Presentation-only + a read query change (larger page size for scroll views). No new
data path, no widening of access (the toggle is a layout affordance; rows stay access-filtered), no
SQL, no `dangerouslySetInnerHTML`, no secrets, no new deps. The board's lifecycle read uses the
existing `useLifecycleConfig` (already used by intake).

### Design fidelity — WAIVED (developer decision)
The full render-and-compare matrix is CI-scale and not run here. These are intentional UI changes
that diverge from the prototype (relocated/icon-only toggle, footer-less scroll galleries/board,
all-7-stage board) — waived by the analyst (skangmwe, 2026-07-21) via the established DCLogic
waived-manifest path. `design-fidelity-web` deliberately omitted from the cache `phases_run` (the
render machinery was not run). Blueprint/prototype not updated by this slice.

## Final Status: CLEAN
- Iterations: 1 · Findings fixed: 0 · Design-fidelity: WAIVED
