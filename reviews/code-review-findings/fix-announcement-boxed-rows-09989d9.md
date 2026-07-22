# fix-announcement-boxed-rows — code review findings

**Label:** fix-announcement-boxed-rows-09989d9
**Scope:** `web/src/features/announcements/announcements.css`, `web/src/features/announcements/components/AnnouncementsManageTable.tsx`
**Layers in scope:** frontend only

## Iteration 1 — 0 findings

Change is presentational only: (1) a `.ann-boxed` scoping wrapper around the shared `TableShell`
in the Manage announcements table so each row reads as a bordered card, and (2) reader-list card
styles for the previously-dead `.ann-list` / `.ann-row` classes on the Announcements list page.

- **Design conformance (`check-design-conformance.sh --web-required`): PASS** — every colour and
  radius in the new `announcements.css` rules traces to a `var(--…)` token (`--border-light`,
  `--radius`, `--bg-surface`, `--space-*`, `--font-mix`, `--text-secondary`). `transparent` as a
  border colour is allowlisted (already used in committed `attachments.css` / `savedViews.css`).
- **web-styling.md:** SCSS-module rule N/A — this feature uses a global `announcements.css`
  (imported once in `App.tsx`) to style the shared grid's global `ast-grid__*` classes; a CSS
  module can't target those. `.ann-boxed` scopes the override so no other `TableShell` (Requests,
  Fields, …) is affected. `data-ds` unaffected: the shared `TableShell` keeps `data-ds="table"`;
  the reader `<li>` keeps `data-ds="card"`.
- **web-component-architecture.md:** `AnnouncementsManageTable` gains one wrapper `<div>` +
  comment; still well under 200 lines. No new state, deps, or logic.
- **web-coding-standards.md:** no `any`, no `console.log`, no magic numbers, no dead code
  introduced (the reader-list styles revive classes the markup already renders).

No mechanical or architectural findings. All 61 announcement unit tests pass unchanged.
