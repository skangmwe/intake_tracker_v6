# Announcements — workspace scoping + platform broadcast

**Date:** 2026-07-24
**Status:** Approved design → ready for implementation plan

## Problem

Announcements today are always workspace-scoped, managed at `/admin/announcements`
(WorkspaceAdmin-gated). A WorkspaceAdmin who administers more than one workspace gets a
dropdown selector to pick which of their workspaces to post to. There is no platform-level
announcements surface.

Desired behaviour:

1. **Workspace side** — a workspace admin should only post to **the workspace they are in**
   (the active workspace), not choose among all workspaces they administer.
2. **Platform side** — only a **platform admin** can post announcements **across all
   workspaces or to specific ones**. This surface should mirror the existing workspace manage
   UX, plus a workspace target picker.

## Current architecture (facts that constrain the design)

- Every announcement row carries a single `WorkspaceId` (NOT NULL). Audience
  (`everyone` / `role-scoped` / `named-users`) resolves **within** that workspace; the bell
  fan-out (`announcement.published` event → `usp_FanOutNotification`) is per-workspace.
- Managing lives at `/admin/announcements` → `ManageAnnouncementsPage`, gated WorkspaceAdmin.
  A multi-workspace admin currently gets a `<select>` across their administered workspaces.
- API: `POST /workspaces/{id}/announcements` (create, WorkspaceAdmin on that workspace),
  `POST /workspaces/{id}/announcements/query` (manage list), item mutations by id
  (`PATCH /announcements/{id}`, `/publish`, `/retire`) are author-or-admin, resolved from the
  row's own workspace.
- Access model already provides both gates: `IAccessGuard.IsPlatformAdminAsync(userId)` and
  `IAccessGuard.HasWorkspaceLevelAsync(userId, workspaceId, WorkspaceAdmin)`.
- The workspace switcher is a **stub**; "active workspace" is derived from memberships via
  `resolveActiveWorkspaceId(memberships)` (prefers the ai-solutions hub, else first
  membership). `WorkspaceAuditPage` is the canonical consumer of this pattern for a
  WorkspaceAdmin-gated surface.
- A platform "list all workspaces" read (`PlatformWorkspaceDirectory`) previously existed but
  was **deleted** in the platform-settings-header reconcile — it must be re-added (focused).

## Locked decisions

From the intake questions:

- **Workspace scope** → **active workspace only.** Drop the selector; bind to the active
  workspace like `WorkspaceAuditPage`.
- **Platform "all workspaces" model** → **fan out to one row per targeted workspace.** Reuse
  the existing per-workspace machinery; no change to core audience/fan-out procs.

Confirmed sub-decisions:

- **Audience for platform posts → `everyone` only** (the whole membership of each targeted
  workspace). Role-scoped / named-users are not offered on the platform editor.
- **"Posted by" for platform posts → the acting platform admin**, fixed (no author picker —
  cross-workspace membership does not apply).
- **Targets are chosen at create time only.** Editing a broadcast changes content
  (title / body / pinned / schedule / auto-archive), never its target set. To change targets,
  retire the broadcast and repost.

## Design

### Part A — Workspace side (Slice 1)

Change `ManageAnnouncementsPage` to bind to the active workspace, mirroring
`WorkspaceAuditPage`:

- `workspaceId = resolveActiveWorkspaceId(me.memberships)`.
- `isAdmin = memberships.some(m => m.workspaceId === workspaceId && m.level === 'WorkspaceAdmin')`.
- Remove the `<select>` workspace dropdown and the `adminMemberships[0]` fallback logic.
- Non-admin of the active workspace → the existing "you need to be a workspace admin" empty
  state. Loading / error states unchanged.

No API, DB, or fan-out change. `POST /workspaces/{id}/announcements` already gates
WorkspaceAdmin on that single workspace, so a caller can only ever create in the active
workspace they administer.

### Part B — Platform side (Slice 2)

**New surface:** `Platform → Announcements` — a new entry in `PLATFORM_NAV`
(`/platform/announcements`), `IsPlatformAdmin`-gated (server-side is the boundary; the
PlatformGate is a courtesy). It mirrors the workspace manage page's table + editor modal, and
adds a **target picker**: **All workspaces** or **specific workspaces** (multi-select).

**Storage — fan out at create time:**

- New nullable column `BroadcastId UNIQUEIDENTIFIER NULL` on the announcement table (migration
  with rollback; existing and workspace-authored rows stay `NULL`).
- `POST /v1/platform/announcements`: resolve the target workspace set (all non-deleted,
  non-template workspaces, or the specific ids supplied), generate one `BroadcastId`, and
  create one row per target via the existing create path (audience `everyone`, author = acting
  admin, `CreatedBy` = actor, `BroadcastId` stamped). Each created-Published row emits its own
  `announcement.published` event → per-workspace bell fan-out, unchanged.

**Reads:**

- `GET /v1/platform/workspaces` — id + name + kind for all non-deleted, non-template
  workspaces (focused re-add of the deleted directory read), for the target picker.
- `POST /v1/platform/announcements/query` — the platform manage list, **grouped by
  `BroadcastId`**: one entry per broadcast with title, posted-by, posted date, target summary
  ("All workspaces" or "N workspaces"), and status. Paginated.

**Broadcast mutations (apply across all copies sharing the `BroadcastId`):**

- Edit — re-applies title / body / pinned / schedule / auto-archive to every copy.
- Retire — retires every copy (never a hard delete, matching the per-row rule).

All platform endpoints are `IsPlatformAdmin`-gated and return 403 (never 404) on access
violation.

**Editor:** mirrors the workspace `AnnouncementEditor` fields (Title, Body, Status
Active/Scheduled + DateTimeField, auto-archive toggle, pinned) minus the "posted by" picker,
plus the target picker. Audience is implicitly `everyone`.

## Slicing

- **Slice 1 — Workspace active-workspace scoping.** Drop the selector, rebind to active
  workspace. Small, safe, independently shippable. Web-only.
- **Slice 2 — Platform broadcast surface.** Migration + `BroadcastId`, platform workspaces
  read, platform announcement create/query/edit/retire endpoints, the new platform surface
  (nav entry, page, editor with target picker, grouped manage table). DB + API + Web.

Slice 1 does not depend on Slice 2 and can ship first.

## Out of scope / non-goals

- No change to the core per-workspace audience resolution or `usp_FanOutNotification`.
- No single firm-wide announcement row (explicitly rejected in favour of fan-out).
- No editing of a broadcast's target set after creation.
- No role-scoped / named-users audience on the platform editor.
- No change to the consumer (bell / history) read path — platform posts land as normal
  per-workspace announcements there.

## Testing

- **Slice 1:** `ManageAnnouncementsPage` bound to active workspace — admin-of-active renders
  the table/editor; non-admin renders the empty state; selector no longer present. jest-axe on
  each rendered state.
- **Slice 2 (API):** platform create fans out one row per target with a shared `BroadcastId`
  (all-workspaces and specific-set); non-platform-admin → 403 on every endpoint; grouped query
  returns one entry per broadcast with the correct target count; broadcast edit/retire touch
  all copies; cancellation. Integration test for the full create → query → edit → retire cycle.
- **Slice 2 (DB):** tSQLt for the new/changed procs (create-with-broadcast, grouped query,
  broadcast edit/retire, platform workspaces read) — happy path, empty/NULL inputs, error
  conditions.
- **Slice 2 (Web):** platform page states (loading / error / empty / list), target picker
  (all vs specific), editor validation, grouped table, edit/retire flows; jest-axe on each
  meaningfully different state; a Playwright flow for post-to-all → appears grouped → retire.
