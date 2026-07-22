# fix-announcement-archive-now-786fbcd — code review findings

**Scope:** wire the manual "Archive now" action (announcements S23). New `ArchiveAnnouncementDialog`, an
"Archive now" action in the `AnnouncementEditor` edit footer, and the page wiring + css.

**Checklists applied:** `web-frontend.md`, `web-component-architecture.md`, `web-coding-standards.md`,
`web-styling.md`, `web-testing.md`, `accessibility.md`.

## Iteration 1 — 0 blocking findings

- **Reuses the existing retire path** — `ArchiveAnnouncementDialog` calls `useRetireAnnouncement`, whose
  endpoint (`usp_RetireAnnouncement`) already sets `Status → Archived` (idempotent). No new backend.
- **Component length:** `ArchiveAnnouncementDialog` ~70 lines; `AnnouncementEditor` still under 200 body
  lines; `ManageAnnouncementsPage` route component at 249 body lines — under the 250 route-component cap
  (justification comment already present). The dialog was made self-contained (owns the mutation) partly
  to keep the page under that cap — a deliberate, local choice; the sibling `RetireViewDialog` is
  presentational, but a self-contained confirm dialog is a clean, common pattern and keeps the page small.
- **Design conformance:** the one new CSS rule (`.ann-editor__archive`) is token-only (`margin-right`,
  `display`) — no colours/radii. Verified by scoped scan.
- **`data-ds`:** the "Archive now" and "Archive announcement" controls are `Button` (`data-ds="btn"`); the
  confirm surface is the shared `Modal`.
- **Three states:** the dialog renders null (closed) / open / inline-error explicitly.
- No `any`, no `console.*`, no `dangerouslySetInnerHTML`, no suppressed lint.

## Final status: CLEAN (0 findings)
