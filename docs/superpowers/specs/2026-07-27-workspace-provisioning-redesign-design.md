# New Workspace build flow — Platform → Workspaces redesign

**Date:** 2026-07-27
**Surface:** Platform Settings → Workspaces (S38)
**Type:** Frontend redesign + one additive backend read path. No change to provisioning logic or schema.

## Problem

Today `/platform/workspaces` drops a platform admin straight into a 3-step form
(Details → Initial admin → Review) that clones the PG/Dept template. There is no
list of existing workspaces, and the wizard's structure/visuals do not match the
approved prototype.

The approved prototype (5 screens) replaces this with:

1. A **Workspaces list** — a rich table (Workspace, Kind, ID Prefix, Owner,
   Members, Provisioned, Status) with a **New workspace** primary button.
2. A **full-screen New workspace wizard** restructured as **Template → Review →
   Details**, with its own header, stepper, `✕` close, and Back/Cancel/Continue
   footer (no side nav).

## What already exists (reused unchanged)

- `POST /api/v1/workspaces` → `WorkspacesController.ProvisionWorkspace` →
  `WorkspaceProvisioningService.ProvisionAsync` → `usp_ProvisionWorkspace`.
  Clones the PG/Dept template in one transaction. Accepts `name`, `prefix`, and
  the initial admin by `initialAdminEmail` (resolved server-side) or
  `initialAdminUserId`. Emits `workspace.provisioned` to the firm-wide audit.
  Error outcomes: blank (400), duplicate-prefix (409), unknown-admin (400),
  template-missing (503). **This endpoint and its whole stack stay as-is.**
- `dbo.Workspaces` (`Name`, `Kind`, `Prefix`, `CreatedAt`, `RetiredAt`, audit
  columns), `dbo.WorkspaceMembership` (`Level` ∈ Viewer/Member/WorkspaceAdmin,
  `CreatedAt`), `dbo.Users` (`DisplayName`). Everything the rich list needs is
  derivable — **no schema change**.
- Frontend primitives: `SideNavLayout`, `TableShell`, `Stepper`, `Button`,
  `TextField`, `formatDate` (numeric + year), `problemMessage`, `PlatformGate`,
  `usePlatformAdmin`.

## Decisions (locked)

1. **List = full rich table.** Extend the backend with one read proc + one
   endpoint. Prototype columns exactly.
2. **Review step = static content.** There is one template; the rich review panel
   is hardcoded presentational copy describing what the PG/Dept template
   provisions. No runtime querying of the live template schema.
3. **Owner field = email input** labelled "Workspace owner" (prototype
   label/placement kept), resolved server-side via the existing
   `initialAdminEmail`. A name-directory lookup does not exist and is out of scope.
4. **Wizard = full-screen focused route, no side nav.** On-system for a
   standalone flow (`steppers-and-wizards.md`, `disclosure-surfaces.md`); matches
   the prototype. The list keeps the existing platform chrome.
5. **Old wizard retired.** `WorkspaceProvisioningPage` (Details → Initial admin →
   Review) is deleted and replaced by the list + new wizard.

## Design

### Routing

- `/platform/workspaces` (inside `PlatformLayout` → `SideNavLayout`) → new
  `WorkspacesListPage`.
- `/platform/workspaces/new` → new `NewWorkspacePage` (full-screen, **outside**
  `SideNavLayout`; own platform-admin courtesy gate). Registered as a sibling
  route so the platform side nav is not rendered.
- Close/`✕`/Cancel and successful Create all navigate to `/platform/workspaces`.

### Backend — rich list read path (additive)

- **`usp_ListWorkspacesForPlatform`** (`database/procedures/platform/`): returns
  one row per non-deleted workspace **excluding** `Kind = 'pg-dept-template'`.
  Columns: `WorkspaceId`, `Name`, `Kind`, `Prefix`, `OwnerDisplayName`
  (DisplayName of the earliest-created active `WorkspaceAdmin` membership; `NULL`
  when none), `MemberCount` (active memberships), `ProvisionedAt` (`CreatedAt`),
  `IsArchived` (`RetiredAt IS NOT NULL`). Ordered by `Kind` then `Name` so the Hub
  sorts distinctly, then PG/Depts alphabetically. Bounded reference list (few
  workspaces) — not paginated, consistent with `usp_ListPlatformWorkspaces`.
  Owner derivation uses a correlated `OUTER APPLY (SELECT TOP 1 … ORDER BY
  m.CreatedAt, m.MembershipId)` so ties are deterministic. tSQLt tests: rows
  excl. template, owner resolves to earliest admin, member count, archived flag,
  no-owner → NULL.
- **`GET /api/v1/workspaces`** on the existing `WorkspacesController`:
  platform-admin gated (403 not 404, mirroring the POST). Returns
  `IReadOnlyList<WorkspaceListRow>`. New service method
  `IWorkspaceProvisioningService.ListAsync` (or a small read helper on the same
  service) running the proc via a keyless `WorkspaceListRow` entity, mapped to the
  DTO. `Cache-Control: private, no-store` per `api-coding-standards.md`.
- **DTO / shared type** `WorkspaceListRow`: `{ id, name, kind (WorkspaceKind),
  prefix, ownerDisplayName: string | null, memberCount: number, provisionedAt:
  IsoDateTime, isArchived: boolean }`. Added to `shared/types/platform.ts` and
  the C# `WorkspaceDtos.cs`. xUnit: admin 200 shape, non-admin 403.

### Frontend — WorkspacesListPage

- Header block: title "Workspaces", one-line lead ("Every practice group or
  department gets its own workspace, provisioned from a base template. The hub
  workspace aggregates records across all of them."), and a **New workspace**
  primary button (`+` leading icon) → navigates to `/platform/workspaces/new`.
- `TableShell` grid, columns: **Workspace** (Name, 600-weight), **Kind**
  (`'ai-solutions'` → "Hub", `'pg-dept'` → "PG/Dept"), **ID Prefix** (monospace),
  **Owner** (`ownerDisplayName` or em-dash), **Members** (right-aligned number),
  **Provisioned** (`formatDate(provisionedAt)`), **Status** (pale status badge —
  Active = `--color-pale-success`, Archived = neutral pale/blue, navy text).
- States: loading (skeleton rows matching columns), error (inline alert + retry),
  empty (never-had-data is effectively impossible since the Hub always exists, but
  render a bordered empty row defensively). Wrapped in `PlatformGate`.
- Data via `useWorkspacesList` (TanStack Query, `queryKey: ['workspaces','list']`).

### Frontend — NewWorkspacePage (full-screen wizard)

Local step state `0|1|2`; three steps on the shared continuous-track `Stepper`
(Template · Review · Details). Full-bleed layout: eyebrow "PLATFORM SETTINGS" +
title "New workspace" top-left, stepper centered, `✕` close top-right; sticky
footer with Back (steps 2–3) · Cancel · primary Continue/Create.

- **Step 1 — Template.** One selectable card "PG/Dept Template" with a
  RECOMMENDED badge, meta line "3 objects · 7-stage lifecycle · 5 views",
  pre-selected (radio semantics, `aria-checked`). Continue → step 2. (Single
  option today; the selection state is real so more templates drop in later.)
- **Step 2 — Review.** Static, read-only panel (module-level constant data →
  mapped to JSX, per `web-component-architecture.md`) describing the PG/Dept
  template: template blurb; **Objects** (Requests · 12 fields, Tasks · 6,
  Attachments · 2); **Notable fields** (Stage, Priority score, Analyst, Due date,
  Hold/Blocked, Repo URL + "+14 more"); **Lifecycle & gates** (Standard delivery:
  7 stage chips + two readiness-gate cards); **Relationships** (Request has Tasks
  1:many, Request has Attachments 1:many); **Saved views** (5); **Dashboards**
  (2); **Access levels** (Viewer/Member/Workspace admin); **Sample records** (3).
  Back / Continue.
- **Step 3 — Details.** `Workspace name` (required), `Workspace owner` (email,
  `autoComplete="email"`, hint "The owner gets the first Workspace admin access
  level."), `Record ID prefix` (required, pattern `^[A-Za-z0-9]{2,16}$`,
  uppercased on submit, hint "Prepended to every record ID — records will look
  like REQ-00001024."). **Create workspace** submits to the existing
  `useProvisionWorkspace` mutation `{ name, prefix, initialAdminEmail }`.
  - Success → `invalidateQueries(['workspaces','list'])` + `ME_QUERY_KEY`,
    navigate to `/platform/workspaces`, success toast "Workspace '{name}' is
    ready."
  - Error → inline alert on the Details step via `problemMessage` (409
    duplicate-prefix, 400 unknown-admin, 503 template-missing); inputs preserved.

Reuse the existing `useProvisionWorkspace` hook and `provisionWorkspace` API call
unchanged.

### Removed

- `web/src/features/platform-admin/components/WorkspaceProvisioningPage.tsx` (+
  its test) and the old `wp-*` styles it owns. The `useWorkspaceProvisioning`
  hook and `api.ts` `provisionWorkspace` are **kept** (reused by the new wizard).
  `platformNav.ts` "Workspaces" entry title/lead updated to describe the list.

## Accessibility

- Wizard is a focused flow: stepper conveys progress with text + state (not color
  alone); `✕` has `aria-label="Close"`; step panels are labelled; the template
  card group uses radio semantics; every field has a real label; errors use
  `aria-invalid` + `aria-describedby`. Focus moves to the step heading on step
  change; `Esc`/Cancel exits to the list.
- Table: semantic `<table>`, `scope="col"` headers, numeric column right-aligned,
  status badge pairs color with a text label. axe assertions per rendered state
  (loading, error, populated) for the list; per step + error for the wizard.

## Slicing

One capability, one bounded context (platform-admin), reuses the provisioning
endpoint. **Single slice** `slice/workspace-provisioning-redesign`: read proc +
tSQLt, list endpoint + DTO + xUnit, list page + hook, full-screen wizard, route
wiring, delete old wizard. Well under the reviewable ceiling. Unit + axe tests
authored in-slice; one Playwright E2E covering list → New workspace → Create →
back-to-list-with-new-row.

## Out of scope

- Editing/archiving a workspace from the list (rows are read-only here).
- Multiple/real template catalog, dynamic template introspection.
- Name-directory owner lookup.
- Changing provisioning logic, `usp_ProvisionWorkspace`, or the schema.
