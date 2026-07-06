---
slice: 22-home
capability: When I sign in I land on Home — a per-user landing composing viewer-scoped queries into panels (Needs your decision · Your work today · Since you were last here · New to triage · pinned announcements) with a Pin-as-home affordance.
spec-section: BS §10.7 · S1 (prototyped)
started: 2026-07-06T17:09:56-04:00
ended: 2026-07-06T17:46:37-04:00
duration: 00:36:41
---

Home (S1) is prototyped; built exactly from the prototype's four-panel layout + pinned strip + Pin-as-home
pin, styled in McDermott tokens. Composed against existing modules (Requests, Approvals, Audit,
Announcements) — one new API module, five focused procs, one small `Users` column.

## Divergences resolved (prototype/contract reconciliation, analyst-confirmed)

1. **`GET /home` is workspace-scoped (`?workspaceId=`)**, not the earlier contract's parameterless form
   (api-contracts §16 updated). Every panel is workspace-specific; the app resolves an active workspace
   everywhere; the prototype's Home sits inside the workspace-switcher context and re-queries on switch.
   Chosen over a cross-workspace aggregate (analyst-confirmed) — simpler and honest to the app model.
2. **"Your work today" = records the caller owns (`CreatedBy`)**; **"New to triage" = records with no
   `AssignedAnalyst`.** Phase 1 has no assignee *user reference* (Analyst/Requestor are free-text field
   values — module-boundaries §16); `CreatedBy` is the only reliable user ref. Honest Phase-1 scoping.
3. **`quickCreateStubs` dropped from `HomeDto`** — the prototype's Home renders no quick-create
   affordance (quick-create lives on the S2 view bar per the changelog). Prototype governs; the earlier
   contract field is removed.
4. **Pin-as-home is a static pressed indicator, no backend write** — the prototype's pin `onClick` is a
   no-op; Home is the only R1 landing surface. Rendered as a real `<button aria-pressed="true">` with the
   prototype's `aria-label`; no persistence endpoint is invented (design-handoff rule: don't add what the
   prototype doesn't render).

## Build decisions

- **`Users.LastHomeSeenAt` (migration 050) anchors "Since you were last here."** `usp_GetHomeActivity`
  reads the prior value, returns record audit events newer than it, then stamps the column to now (so the
  next load shows only what changed). First visit (NULL) falls back to a 7-day window. Write-on-read is the
  honest implementation of a visit tracker; `Cache-Control: private, no-store` (default) keeps it correct.
  Only record events (RecordId IS NOT NULL) surface — config events are noise on this panel (matches the
  prototype). The prior value is returned via an OUTPUT param (drives the "Since ..." header even when the
  list is empty), so `HomeService.ReadActivityAsync` uses raw ADO.NET (FromSqlRaw can't surface an OUTPUT).
- **Five focused procs, not one 5-result-set monster** — each panel proc is single-purpose and
  independently tSQLt-testable (mirrors the search/gates split). `HomeService` composes them sequentially
  (DbContext isn't thread-safe); decisions/work/triage carry a windowed `TotalCount` for the header counts.
- **SLA on the work panel reuses `RequestsService.ComputeSla`** so the Home due-badge matches the Requests
  list exactly; the proc returns `DueDate` + `DueSoonWindowDays` and the service derives the state.
- **`ConditionEngine` gains the `@currentUser`/`@me` token** (the plan's "current-user reference") —
  optional per-evaluation `currentUserId` param, mirroring slice 21's `@today`. It is substrate for
  future viewer-scoped saved-view filters; the Home panels themselves compose dedicated SQL, so the token
  isn't exercised by Home yet (built + unit-tested per the plan's scope line).
- **Scaffold placeholder Home types removed** — `notifications.ts` held stub `HomeDto`/`HomeApprovalItem`/
  `HomeRecordItem`/`HomeActivityItem` (never consumed). They collided with the real `home.ts`; excised
  (orphaned `ApprovalRequestId` import dropped) so the barrel exports one `HomeDto`.

## Deferred / not built

- Panel "see more" pagination endpoints (the contract's "if the user wants more") — not in the prototype;
  panels are capped at 20 (pinned 5).
- Any Pin-as-home persistence / alternate landing surface — no such concept in R1.
