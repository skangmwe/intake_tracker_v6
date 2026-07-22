# slice-announcements-frontend-7decb1e — code review findings

**Scope:** announcements reconciliation slice 3 (frontend) — the manage table, the reworked editor
modal, the client-side view helper, the shared `DateTimeField`, the hooks/api/css/constants changes,
and the deletion of the dead `ManageAnnouncementRow`.

**Checklists applied:** `web-frontend.md`, `web-component-architecture.md`, `web-coding-standards.md`,
`web-styling.md`, `web-testing.md`, `accessibility.md`.

## Iteration 1 — 1 finding

| # | File | Severity | Fix class | Rule | Issue | Resolution |
|---|------|----------|-----------|------|-------|------------|
| 1 | `web/src/features/announcements/components/ManageAnnouncementsPage.tsx` | Low | Mechanical | `web-component-architecture.md#component-length` | Route component body exceeds the 200-line guideline (composes table + footer + editor + workspace resolution + client view state + create/update wiring). | Added the route-component justification comment (rule permits up to 250 lines for route components with a justification). Presentational pieces (table, editor) are already extracted; the remainder is orchestration. Applied in this iteration. |

### Design conformance (deterministic token gate)

`check-design-conformance.sh --web-required` — my changed component styles use **only** design tokens:
no raw hex / `rgb()` / `hsl()` / named CSS colours, and the single `border-radius` uses `var(--radius)`
(verified by scoped scan of `announcements.css` + the changed `.tsx`). No new violations introduced.

### Notes (no findings)

- `data-ds` markers present on every design-system element: `TableShell` (`table`), `StatusPill`
  (`status-pill`), `FilterFunnel` (`filter-funnel`), `DateTimeField` (`datetime-field`), the auto-archive
  toggle (`toggle`), the pin checkbox (`checkbox`), `Select` (`select`), `TableFooter` (`table-footer`).
- Three non-data states rendered explicitly (loading, error, zero-data empty, filtered-to-zero).
- No `any`, no `console.*`, no `dangerouslySetInnerHTML`, no suppressed `exhaustive-deps`.
- Named constants for all page sizes (`MANAGE_ANNOUNCEMENTS_PAGE_SIZE`, `MANAGE_ANNOUNCEMENTS_FETCH_SIZE`).
- `AnnouncementEditor` (214 total lines) is under 200 lines excluding imports + the two interface defs.

## Final status: CLEAN (1 mechanical fix applied, 0 open)
