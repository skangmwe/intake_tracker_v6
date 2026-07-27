# Functional workspace switcher + drop the admin dropdowns — design

**Date:** 2026-07-27
**Status:** Approved (design), pending spec review
**Area:** `web/` — shared workspace context, sidebar switcher, workspace admin sub-screens

## Problem

The workspace admin sub-screens (Fields & objects, AI assist, Triggers, Lifecycle & gates)
each render their own **Workspace `<select>` dropdown** when the signed-in user admins more
than one workspace. This duplicates workspace selection inside individual pages and conflates
"which workspace am I working in" with "which page am I on."

The desired model: **any change made from a workspace screen applies only to the active
workspace.** Users choose the active workspace once, from the top-left switcher in the sidebar.
Platform-wide changes live on the Platform tab (already separate, out of scope here).

## Key discovery — the switcher is a stub

The top-left `WorkspaceSwitcher` is currently a **non-functional stub**: picking a workspace
in the menu only closes the menu. The whole app derives its active workspace deterministically
via `resolveActiveWorkspaceId(memberships)` — *AI Solutions hub, else first membership* — with
no stateful switching anywhere. localStorage is not involved.

Consequence: today the four admin dropdowns are the **only working way** for a multi-workspace
admin to manage a non-default workspace's config. Simply deleting the dropdowns without making
the switcher real would strand multi-workspace admins on the hub with no path to their other
workspaces.

Therefore this change has two halves: **(1) make the switcher real**, then **(2) remove the
admin dropdowns so those pages follow the active workspace.**

## Scope

**In scope (web only):**
- New active-workspace React context + hook, persisted to localStorage, validated against memberships.
- Wire `WorkspaceSwitcher` to set the active workspace.
- Repoint every consumer that calls `resolveActiveWorkspaceId(me?.memberships)` to the context hook.
- Remove the `<select>` dropdown from the four admin pages; gate them on the active workspace.
- Tests for all of the above.

**Out of scope:**
- Any API / database change (workspace scoping is already enforced server-side per request).
- The Platform tab and platform-admin surfaces.
- Changing `resolveActiveWorkspaceId`'s default-picking logic (it is reused as the fallback).

## Design

### 1. Active-workspace context

New module in `web/src/shared/workspace/` (e.g. `ActiveWorkspaceContext.tsx`):

- `ActiveWorkspaceProvider` — mounted at the app root, above the router/AppShell, inside the
  QueryClientProvider so it can read `useMe()`.
- Hook `useActiveWorkspace()` → `{ activeWorkspaceId, setActiveWorkspaceId, workspaces }`.
  - `activeWorkspaceId: WorkspaceId | null` — the resolved active workspace (null while `me`
    is loading or the user has no switchable workspace).
  - `setActiveWorkspaceId(id: WorkspaceId): void` — updates context state and writes localStorage.
  - `workspaces` — the switchable memberships (all memberships **except** `pg-dept-template`,
    matching the switcher's existing filter).

**Initial value resolution (in the provider):**
1. Read persisted id from localStorage key `ast.active-workspace`.
2. If it matches a current *switchable* membership → use it.
3. Else fall back to `resolveActiveWorkspaceId(memberships)` (hub, else first). `resolveActiveWorkspaceId`
   is retained solely as this default-picker.

**Membership changes:** if memberships reload and the active id is no longer valid, reset to the
default and rewrite localStorage.

**Persistence note:** `web-persistence.md` reserves localStorage for the theme key, but
`AppShell` already persists the sidebar-collapse flag in localStorage. This active-workspace id
follows that existing precedent — a small synchronous UI preference that must be known at first
render to scope queries, and that users expect to survive a refresh (as theme and collapse do).

### 2. WorkspaceSwitcher (make it real)

- Read `{ activeWorkspaceId, setActiveWorkspaceId, workspaces }` from `useActiveWorkspace()`
  instead of computing `current = workspaces[0]`.
- Trigger label reflects the active workspace.
- Each menu item's `onClick` → `setActiveWorkspaceId(membership.workspaceId)` then close.
- The check-mark renders on the item whose id equals `activeWorkspaceId` (not `index === 0`).
- Continue to exclude `pg-dept-template` (now sourced from `workspaces`).

Switching is synchronous (context + localStorage) — no page reload. Consumers re-render and
TanStack Query refetches on the new workspace-scoped query keys.

### 3. Repoint consumers

Replace `resolveActiveWorkspaceId(me?.memberships)` with `useActiveWorkspace().activeWorkspaceId`
in every consumer surface. Known call sites (verify complete at implementation time):

- `features/ask/components/AskPage.tsx`
- `features/announcements/components/ManageAnnouncementsPage.tsx`
- `features/dashboards/components/DashboardsListPage.tsx`
- `features/home/HomeView.tsx`
- `features/import-export/components/ImportExportPage.tsx`
- `features/custom-records/components/CustomRecordsListPage.tsx`
- `features/custom-records/components/CustomRecordDetailPage.tsx`
- `features/custom-records/components/CustomRecordCreatePage.tsx`
- `features/audit/components/WorkspaceAuditPage.tsx`
- `features/saved-views/components/ViewsDashboardsPage.tsx`
- `features/search/components/SearchResultsPage.tsx`
- `features/toolkit/components/ToolkitSurface.tsx`
- `features/users/components/UsersAccessPage.tsx`
- `features/requests/components/DraftsPage.tsx`
- `features/requests/components/IntakeFormPage.tsx`
- `features/requests/components/RequestsListPage.tsx`
- `shared/components/Layout/AppShell.tsx`
- `shared/components/Layout/WorkspaceSearch.tsx`

Behavior is unchanged until a user actually switches; then all surfaces follow. Each edit is the
same mechanical swap (drop the import + `useMemo`, read the hook).

### 4. Remove the four admin dropdowns + gate on active workspace

For `FieldsAdminPage`, `AiSettingsPage`, `TriggersAdminPage`, `LifecyclePage`:

- Delete the `<select>` dropdown JSX and the `selectedWorkspaceId` `useState` +
  `selectedWorkspaceId ?? adminMemberships[0]` resolution.
- Read `activeWorkspaceId` from `useActiveWorkspace()`.
- Admin gate: `isAdmin = memberships.some(m => m.workspaceId === activeWorkspaceId && m.level === 'WorkspaceAdmin')`.
  - `isAdmin` → render tabs/content scoped to `activeWorkspaceId` (unchanged downstream props).
  - not admin (or no active workspace) → render the existing "You need to be a workspace admin…"
    empty/warning state.

This mirrors how `UsersAccessPage` already behaves. Managing another workspace's config now means
switching to it top-left; there is no per-page workspace picker.

## Testing

- **New** — `ActiveWorkspaceContext` tests: default resolution (hub-else-first), localStorage
  persistence round-trip, invalid-persisted-id fallback, setter updates state + writes storage,
  `pg-dept-template` excluded from `workspaces`. jest-axe on any rendered output.
- **Shared wrapper** — add `ActiveWorkspaceProvider` to the shared `src/test-utils.tsx` render
  helper so the ~18 consumer test files inherit it, seeded from their existing mocked `useMe`.
  (Confirm the helper's exact shape at implementation time; `renderHook` tests may need a local
  wrapper.)
- **Updated** — `WorkspaceSwitcher.test.tsx`: selecting an item calls `setActiveWorkspaceId` and
  the check-mark follows the active id (not `index === 0`).
- **Updated** — the four admin page tests: remove dropdown assertions; add active-workspace
  scoping and the not-admin gate state, each under axe.
- **Consumer tests** — keep default-workspace assertions; add at least one "follows a switched
  active workspace" case (e.g. on Requests) to prove the wiring end-to-end.

## Risks / notes

- The hook throws without a provider — the shared test wrapper must include it, or individual
  tests will fail. This is the main churn risk; adding it once to `test-utils` contains it.
- Switching to a member-only (non-admin) workspace correctly gates the four admin pages — this is
  intended, not a regression.
- No server change: the API already scopes every request to the workspace id it is given and
  enforces membership/admin server-side; the UI gate remains a courtesy.
