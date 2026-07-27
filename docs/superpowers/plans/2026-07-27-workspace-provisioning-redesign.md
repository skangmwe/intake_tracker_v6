# New Workspace build flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-page workspace-provisioning form with a rich Workspaces **list** page plus a full-screen **New workspace** wizard (Template → Review → Details), matching the approved prototype.

**Architecture:** One additive backend read path (`usp_ListWorkspacesForPlatform` → `GET /api/v1/workspaces`) feeds a `TableShell` list at `/platform/workspaces` (inside the platform side-nav chrome). A new full-screen route `/platform/workspaces/new` (outside the app shell and platform side nav) hosts a 3-step wizard that reuses the **existing** `POST /api/v1/workspaces` provisioning stack unchanged. The old `WorkspaceProvisioningPage` is deleted. No schema change.

**Tech Stack:** SQL Server (stored proc + tSQLt), ASP.NET Core + EF Core keyless projection (xUnit + Moq), React 19 + TypeScript, TanStack Query, Jest + jest-axe + Testing Library, Playwright.

## Global Constraints

- **No schema change, no migration.** Only a new `CREATE OR ALTER PROCEDURE` under `database/procedures/platform/` (the migrations runner applies procedures automatically).
- **Platform-admin gated server-side.** New `GET /api/v1/workspaces` returns **403 not 404** for non-admins, mirroring the existing POST.
- **Reuse, don't rewrite provisioning.** `usp_ProvisionWorkspace`, `WorkspaceProvisioningService.ProvisionAsync`, `provisionWorkspace()`, and `useProvisionWorkspace()` are used as-is.
- **Design tokens only** in any CSS — no raw hex/rgb, radius 2px or pill only (`web-styling.md`, design `_core-requirements.md`).
- **`data-ds` on every design-system component** (already present on `Button`, `Stepper`, `TableShell`, `StatusPill`; add it to the new template card).
- **Dates** render only via `formatDate` from `@/shared/utils/dateFormat` (numeric + year).
- **jest-axe on every meaningfully different rendered state**; 80% coverage floor from real-behaviour tests (`web-testing.md`, `web/CLAUDE.md`).
- **Variables self-documenting**; no single-letter names incl. loop counters (`web-coding-standards.md`).
- **Enumerable UI lists = typed module-level constants**, not inline JSX (`web-component-architecture.md`).
- Edit-time gate after each frontend task: `npx tsc --noEmit` clean. Slice-completion gates run later via `/dev-review-and-remediate`.

---

## File Structure

**Database**
- Create `database/procedures/platform/usp_ListWorkspacesForPlatform.sql` — rich list read.
- Create `database/tests/platform/test_usp_ListWorkspacesForPlatform.sql` — tSQLt.

**API**
- Modify `api/Api/Data/Entities.cs` — add `WorkspaceListReadRow` keyless class.
- Modify `api/Api/Data/AppDbContext.cs` — register keyless entity.
- Modify `api/Api/Modules/Workspaces/WorkspaceDtos.cs` — add `WorkspaceListRow` record.
- Modify `api/Api/Modules/Workspaces/WorkspaceProvisioningService.cs` — add `ListAsync`.
- Modify `api/Api/Modules/Workspaces/WorkspacesController.cs` — add `[HttpGet] ListWorkspaces`.
- Modify `api/Api.Tests/WorkspacesControllerTests.cs` — list-endpoint tests.

**Shared types**
- Modify `shared/types/platform.ts` — add `WorkspaceListRow`.

**Frontend**
- Modify `web/src/features/platform-admin/api.ts` — add `fetchWorkspacesList`.
- Create `web/src/features/platform-admin/useWorkspacesList.ts` — TanStack query hook.
- Create `web/src/features/platform-admin/components/WorkspacesListPage.tsx` + `.test.tsx`.
- Create `web/src/features/platform-admin/newWorkspaceTemplate.ts` — static Review-step data.
- Create `web/src/features/platform-admin/components/NewWorkspacePage.tsx` + `.test.tsx`.
- Create `web/src/features/platform-admin/newWorkspace.css` — list header + full-screen wizard styles.
- Modify `web/src/features/platform-admin/index.ts` — export new pages, drop old.
- Modify `web/src/features/platform-admin/platformNav.ts` — update Workspaces title/lead.
- Modify `web/src/App.tsx` — route wiring (list nested; wizard full-screen sibling).
- Delete `web/src/features/platform-admin/components/WorkspaceProvisioningPage.tsx` + `.test.tsx`.
- Create `web/e2e/platform-workspaces.spec.ts` — E2E.

---

## Task 1: DB read proc `usp_ListWorkspacesForPlatform` + tSQLt

**Files:**
- Create: `database/procedures/platform/usp_ListWorkspacesForPlatform.sql`
- Test: `database/tests/platform/test_usp_ListWorkspacesForPlatform.sql`

**Interfaces:**
- Produces: result set columns `WorkspaceId UNIQUEIDENTIFIER`, `Name NVARCHAR`, `Kind NVARCHAR`, `Prefix NVARCHAR`, `OwnerDisplayName NVARCHAR NULL`, `MemberCount INT`, `ProvisionedAt DATETIME2`, `IsArchived BIT`. Consumed by Task 4 (`WorkspaceListReadRow`).

- [ ] **Step 1: Write the failing tSQLt tests**

Create `database/tests/platform/test_usp_ListWorkspacesForPlatform.sql`. Follow the existing `database/tests/platform/` structure (FakeTable + AssertEqualsTable). Cover: excludes the `pg-dept-template`; owner = earliest active `WorkspaceAdmin`; member count = active memberships only; `IsArchived` from `RetiredAt`; no-admin workspace → `OwnerDisplayName` NULL.

```sql
-- =============================================
-- Author:      Workspace provisioning redesign
-- Description: Unit tests for usp_ListWorkspacesForPlatform (rich workspaces list).
-- =============================================
EXEC tSQLt.NewTestClass 'test_usp_ListWorkspacesForPlatform';
GO
CREATE OR ALTER PROCEDURE test_usp_ListWorkspacesForPlatform.[test excludes the pg-dept-template row]
AS
BEGIN
    EXEC tSQLt.FakeTable 'dbo.Workspaces';
    EXEC tSQLt.FakeTable 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable 'dbo.Users';

    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, CreatedAt, RetiredAt, IsDeleted)
    VALUES ('11111111-1111-4111-8111-111111111111', N'Litigation', N'pg-dept', N'LIT', '2026-07-01', NULL, 0),
           ('22222222-2222-4222-8222-222222222222', N'PG / Department Template', N'pg-dept-template', N'TMPL', '2026-01-01', NULL, 0);

    CREATE TABLE #expected (WorkspaceId UNIQUEIDENTIFIER);
    INSERT INTO #expected VALUES ('11111111-1111-4111-8111-111111111111');

    SELECT WorkspaceId INTO #actual
    FROM (SELECT WorkspaceId, Name, Kind, Prefix, OwnerDisplayName, MemberCount, ProvisionedAt, IsArchived
          FROM (SELECT * FROM (VALUES (1)) v(x) CROSS APPLY (SELECT 1) y) z) q; -- placeholder replaced below
    -- Replace the above with an actual EXEC capture:
    DROP TABLE #actual;
    SELECT WorkspaceId, Name, Kind, Prefix, OwnerDisplayName, MemberCount, ProvisionedAt, IsArchived
    INTO #captured FROM (SELECT TOP 0 CAST(NULL AS UNIQUEIDENTIFIER) WorkspaceId, CAST(NULL AS NVARCHAR(200)) Name,
        CAST(NULL AS NVARCHAR(32)) Kind, CAST(NULL AS NVARCHAR(16)) Prefix, CAST(NULL AS NVARCHAR(256)) OwnerDisplayName,
        CAST(NULL AS INT) MemberCount, CAST(NULL AS DATETIME2) ProvisionedAt, CAST(NULL AS BIT) IsArchived) t;
    INSERT INTO #captured EXEC dbo.usp_ListWorkspacesForPlatform;

    SELECT WorkspaceId INTO #actualIds FROM #captured;
    EXEC tSQLt.AssertEqualsTable '#expected', '#actualIds';
END;
GO
CREATE OR ALTER PROCEDURE test_usp_ListWorkspacesForPlatform.[test owner is the earliest workspace admin and member count is active only]
AS
BEGIN
    EXEC tSQLt.FakeTable 'dbo.Workspaces';
    EXEC tSQLt.FakeTable 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable 'dbo.Users';

    DECLARE @ws UNIQUEIDENTIFIER = '11111111-1111-4111-8111-111111111111';
    DECLARE @early UNIQUEIDENTIFIER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    DECLARE @late  UNIQUEIDENTIFIER = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';

    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, CreatedAt, RetiredAt, IsDeleted)
    VALUES (@ws, N'Litigation', N'pg-dept', N'LIT', '2026-07-01', NULL, 0);
    INSERT INTO dbo.Users (UserId, DisplayName, IsDeleted)
    VALUES (@early, N'Grace Lin', 0), (@late, N'Late Admin', 0);
    INSERT INTO dbo.WorkspaceMembership (MembershipId, WorkspaceId, UserId, Level, CreatedAt, IsDeleted)
    VALUES (NEWID(), @ws, @late,  N'WorkspaceAdmin', '2026-07-05', 0),
           (NEWID(), @ws, @early, N'WorkspaceAdmin', '2026-07-02', 0),
           (NEWID(), @ws, NEWID(), N'Member',        '2026-07-03', 0),
           (NEWID(), @ws, NEWID(), N'Viewer',        '2026-07-04', 1); -- deleted → not counted

    CREATE TABLE #captured (WorkspaceId UNIQUEIDENTIFIER, Name NVARCHAR(200), Kind NVARCHAR(32), Prefix NVARCHAR(16),
        OwnerDisplayName NVARCHAR(256), MemberCount INT, ProvisionedAt DATETIME2, IsArchived BIT);
    INSERT INTO #captured EXEC dbo.usp_ListWorkspacesForPlatform;

    DECLARE @owner NVARCHAR(256) = (SELECT OwnerDisplayName FROM #captured WHERE WorkspaceId = @ws);
    DECLARE @count INT = (SELECT MemberCount FROM #captured WHERE WorkspaceId = @ws);
    EXEC tSQLt.AssertEqualsString 'Grace Lin', @owner;
    EXEC tSQLt.AssertEquals 3, @count; -- late admin + early admin + member; deleted viewer excluded
END;
GO
CREATE OR ALTER PROCEDURE test_usp_ListWorkspacesForPlatform.[test archived flag and null owner when no admin]
AS
BEGIN
    EXEC tSQLt.FakeTable 'dbo.Workspaces';
    EXEC tSQLt.FakeTable 'dbo.WorkspaceMembership';
    EXEC tSQLt.FakeTable 'dbo.Users';

    DECLARE @ws UNIQUEIDENTIFIER = '33333333-3333-4333-8333-333333333333';
    INSERT INTO dbo.Workspaces (WorkspaceId, Name, Kind, Prefix, CreatedAt, RetiredAt, IsDeleted)
    VALUES (@ws, N'Tax', N'pg-dept', N'TAX', '2026-05-14', '2026-06-01', 0);

    CREATE TABLE #captured (WorkspaceId UNIQUEIDENTIFIER, Name NVARCHAR(200), Kind NVARCHAR(32), Prefix NVARCHAR(16),
        OwnerDisplayName NVARCHAR(256), MemberCount INT, ProvisionedAt DATETIME2, IsArchived BIT);
    INSERT INTO #captured EXEC dbo.usp_ListWorkspacesForPlatform;

    DECLARE @isArchived BIT = (SELECT IsArchived FROM #captured WHERE WorkspaceId = @ws);
    DECLARE @owner NVARCHAR(256) = (SELECT OwnerDisplayName FROM #captured WHERE WorkspaceId = @ws);
    DECLARE @count INT = (SELECT MemberCount FROM #captured WHERE WorkspaceId = @ws);
    EXEC tSQLt.AssertEquals 1, @isArchived;
    EXEC tSQLt.AssertEquals 0, @count;
    IF @owner IS NOT NULL EXEC tSQLt.Fail 'OwnerDisplayName should be NULL when no WorkspaceAdmin exists';
END;
GO
```

> Note: the first test's placeholder block is illustrative of the capture pattern; when implementing, use the clean `#captured` INSERT-EXEC form shown in the second/third tests for all three (drop the placeholder scaffolding).

- [ ] **Step 2: Run the tests to verify they fail**

tSQLt runs in CI only (not locally — see `dev-ship-gotchas`). Instead verify the proc file is absent so the tests would fail on `usp_ListWorkspacesForPlatform` not existing:
Run: `ls database/procedures/platform/usp_ListWorkspacesForPlatform.sql`
Expected: "No such file".

- [ ] **Step 3: Write the stored procedure**

Create `database/procedures/platform/usp_ListWorkspacesForPlatform.sql`:

```sql
-- =============================================
-- Author:      Workspace provisioning redesign
-- Create Date: 2026-07-27
-- Description: The rich Platform → Workspaces list. One row per non-deleted workspace except the
--              pg-dept-template clone source. Owner = DisplayName of the earliest active
--              WorkspaceAdmin membership (NULL when none). MemberCount = active memberships.
--              IsArchived from RetiredAt. Bounded reference list (few workspaces) — not paginated,
--              consistent with usp_ListPlatformWorkspaces. Platform-admin enforced at the controller.
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_ListWorkspacesForPlatform
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SELECT
        w.WorkspaceId,
        w.Name,
        w.Kind,
        w.Prefix,
        owner.DisplayName AS OwnerDisplayName,
        (SELECT COUNT(1)
           FROM dbo.WorkspaceMembership AS m
          WHERE m.WorkspaceId = w.WorkspaceId AND m.IsDeleted = 0) AS MemberCount,
        w.CreatedAt AS ProvisionedAt,
        CAST(CASE WHEN w.RetiredAt IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS IsArchived
    FROM dbo.Workspaces AS w
    OUTER APPLY (
        SELECT TOP (1) u.DisplayName
          FROM dbo.WorkspaceMembership AS wa
          JOIN dbo.Users AS u ON u.UserId = wa.UserId AND u.IsDeleted = 0
         WHERE wa.WorkspaceId = w.WorkspaceId
           AND wa.IsDeleted = 0
           AND wa.Level = N'WorkspaceAdmin'
         ORDER BY wa.CreatedAt, wa.MembershipId
    ) AS owner
    WHERE w.IsDeleted = 0
      AND w.Kind <> N'pg-dept-template'
    ORDER BY w.Kind, w.Name;
END;
GO
```

- [ ] **Step 4: Verify the proc file parses (syntax scan)**

Run: `grep -c "CREATE OR ALTER PROCEDURE dbo.usp_ListWorkspacesForPlatform" database/procedures/platform/usp_ListWorkspacesForPlatform.sql`
Expected: `1`. (Full tSQLt execution happens in CI via `/dev-review-and-remediate`.)

- [ ] **Step 5: Commit**

```bash
git add database/procedures/platform/usp_ListWorkspacesForPlatform.sql database/tests/platform/test_usp_ListWorkspacesForPlatform.sql
git commit -m "feat(db): usp_ListWorkspacesForPlatform rich workspaces list read"
```

---

## Task 2: Shared type `WorkspaceListRow`

**Files:**
- Modify: `shared/types/platform.ts`

**Interfaces:**
- Produces: `WorkspaceListRow` — consumed by Task 3 (frontend api/hook) and mirrored by Task 4 (C# DTO).

- [ ] **Step 1: Add the type**

Append to the S38 section of `shared/types/platform.ts` (near `WorkspaceProvisionResult`). Reuse `IsoDateTime`, `WorkspaceId`, `WorkspaceKind` already imported at the top of the file.

```ts
/**
 * One row of the Platform → Workspaces list (GET /api/v1/workspaces, platform-admin only).
 * `ownerDisplayName` is the earliest WorkspaceAdmin's display name, or null when the workspace has
 * no admin yet. `isArchived` reflects the workspace's RetiredAt.
 */
export interface WorkspaceListRow {
  id: WorkspaceId;
  name: string;
  kind: WorkspaceKind;
  prefix: string;
  ownerDisplayName: string | null;
  memberCount: number;
  provisionedAt: IsoDateTime;
  isArchived: boolean;
}
```

- [ ] **Step 2: Verify the barrel re-exports it**

`shared/types/index.ts` re-exports `./platform` with `export *` (confirm). Run: `grep -n "platform" shared/types/index.ts`
Expected: a line exporting `./platform`. If it uses an explicit list, add `WorkspaceListRow` to it.

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add shared/types/platform.ts shared/types/index.ts
git commit -m "feat(types): WorkspaceListRow shared type"
```

---

## Task 3: API list endpoint (DTO + keyless entity + service + controller + xUnit)

**Files:**
- Modify: `api/Api/Modules/Workspaces/WorkspaceDtos.cs`
- Modify: `api/Api/Data/Entities.cs`
- Modify: `api/Api/Data/AppDbContext.cs`
- Modify: `api/Api/Modules/Workspaces/WorkspaceProvisioningService.cs`
- Modify: `api/Api/Modules/Workspaces/WorkspacesController.cs`
- Test: `api/Api.Tests/WorkspacesControllerTests.cs`

**Interfaces:**
- Consumes: `usp_ListWorkspacesForPlatform` (Task 1).
- Produces: `GET /api/v1/workspaces` → `IReadOnlyList<WorkspaceListRow>`; `IWorkspaceProvisioningService.ListAsync(CancellationToken)`.

- [ ] **Step 1: Add the failing controller tests**

Add to `api/Api.Tests/WorkspacesControllerTests.cs` (reuse the existing `Build(...)` helper). Add a service-mock overload note: the existing `Build` takes `Mock<IWorkspaceProvisioningService>`.

```csharp
[Fact]
public async Task ListWorkspaces_NotAdmin_Returns403()
{
    var service = new Mock<IWorkspaceProvisioningService>();

    var result = await Build(service, isPlatformAdmin: false).ListWorkspaces(CancellationToken.None);

    var problem = Assert.IsType<ObjectResult>(result);
    Assert.Equal(StatusCodes.Status403Forbidden, problem.StatusCode);
    service.Verify(candidate => candidate.ListAsync(It.IsAny<CancellationToken>()), Times.Never);
}

[Fact]
public async Task ListWorkspaces_Admin_ReturnsRows()
{
    var service = new Mock<IWorkspaceProvisioningService>();
    var rows = new List<WorkspaceListRow>
    {
        new(Guid.NewGuid(), "Litigation", "pg-dept", "LIT", "Grace Lin", 64,
            new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc), false),
    };
    service.Setup(candidate => candidate.ListAsync(It.IsAny<CancellationToken>())).ReturnsAsync(rows);

    var result = await Build(service, isPlatformAdmin: true).ListWorkspaces(CancellationToken.None);

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Same(rows, ok.Value);
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd api && dotnet build`
Expected: FAIL — `ListWorkspaces`, `WorkspaceListRow`, and `ListAsync` do not exist yet.

- [ ] **Step 3: Add the DTO**

In `api/Api/Modules/Workspaces/WorkspaceDtos.cs`, add below `WorkspaceProvisionResponse`:

```csharp
/// <summary>One row of the Platform → Workspaces list (mirrors WorkspaceListRow in shared/types).</summary>
public sealed record WorkspaceListRow(
    Guid Id,
    string Name,
    string Kind,
    string Prefix,
    string? OwnerDisplayName,
    int MemberCount,
    DateTime ProvisionedAt,
    bool IsArchived);
```

- [ ] **Step 4: Add the keyless read entity**

In `api/Api/Data/Entities.cs`, next to `WorkspaceProvisionRow` (~line 390):

```csharp
/// <summary>One row from usp_ListWorkspacesForPlatform (S38 rich list). Keyless projection.</summary>
public sealed class WorkspaceListReadRow
{
    public Guid WorkspaceId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string Prefix { get; set; } = string.Empty;
    public string? OwnerDisplayName { get; set; }
    public int MemberCount { get; set; }
    public DateTime ProvisionedAt { get; set; }
    public bool IsArchived { get; set; }
}
```

Register it in `api/Api/Data/AppDbContext.cs` next to the `WorkspaceProvisionRow` registration (line 151):

```csharp
modelBuilder.Entity<WorkspaceListReadRow>().HasNoKey().ToView((string?)null);
```

- [ ] **Step 5: Add `ListAsync` to the service**

In `WorkspaceProvisioningService.cs`, add to the interface:

```csharp
Task<IReadOnlyList<WorkspaceListRow>> ListAsync(CancellationToken cancellationToken);
```

And the implementation (uses the injected `_db`; no parameters — proc reads all):

```csharp
public async Task<IReadOnlyList<WorkspaceListRow>> ListAsync(CancellationToken cancellationToken)
{
    var rows = await _db.Set<WorkspaceListReadRow>()
        .FromSqlRaw("EXEC dbo.usp_ListWorkspacesForPlatform")
        .ToListAsync(cancellationToken)
        .ConfigureAwait(false);

    return rows
        .Select(row => new WorkspaceListRow(
            row.WorkspaceId, row.Name, row.Kind, row.Prefix,
            row.OwnerDisplayName, row.MemberCount, row.ProvisionedAt, row.IsArchived))
        .ToList();
}
```

- [ ] **Step 6: Add the controller action**

In `WorkspacesController.cs`, add below `ProvisionWorkspace`:

```csharp
/// <summary>The rich Platform → Workspaces list (Platform admin only).</summary>
[HttpGet]
[ProducesResponseType(typeof(IReadOnlyList<WorkspaceListRow>), StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public async Task<IActionResult> ListWorkspaces(CancellationToken cancellationToken)
{
    if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, cancellationToken))
    {
        return AccessDenied();
    }

    var rows = await _provisioning.ListAsync(cancellationToken);
    return Ok(rows);
}
```

The default `private, no-store` cache header is applied by existing middleware (`api-coding-standards.md`); no per-action header needed.

- [ ] **Step 7: Run the tests**

Run: `cd api && dotnet test --filter "FullyQualifiedName~WorkspacesControllerTests"`
Expected: PASS (existing provisioning tests + the two new list tests).

- [ ] **Step 8: Commit**

```bash
git add api/Api/Modules/Workspaces/ api/Api/Data/Entities.cs api/Api/Data/AppDbContext.cs api/Api.Tests/WorkspacesControllerTests.cs
git commit -m "feat(api): GET /api/v1/workspaces rich list endpoint"
```

---

## Task 4: Frontend data — `fetchWorkspacesList` + `useWorkspacesList`

**Files:**
- Modify: `web/src/features/platform-admin/api.ts`
- Create: `web/src/features/platform-admin/useWorkspacesList.ts`
- Test: `web/src/features/platform-admin/useWorkspacesList.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/workspaces` (Task 3), `WorkspaceListRow` (Task 2).
- Produces: `fetchWorkspacesList(signal?) => Promise<WorkspaceListRow[]>`; `useWorkspacesList()` (TanStack query, key `['workspaces','list']`); exported const `WORKSPACES_LIST_QUERY_KEY = ['workspaces','list']`.

- [ ] **Step 1: Add the API call**

In `api.ts`, extend the imported type list with `WorkspaceListRow` and add under the S38 section:

```ts
/** The rich Platform → Workspaces list (platform-admin only). */
export function fetchWorkspacesList(signal?: AbortSignal): Promise<WorkspaceListRow[]> {
  return apiFetch<WorkspaceListRow[]>('/v1/workspaces', signal ? { signal } : {});
}
```

- [ ] **Step 2: Write the failing hook test**

Create `web/src/features/platform-admin/useWorkspacesList.test.tsx` (model on existing platform hook tests; use `renderHook` + a QueryClient wrapper from `@/test-utils` if present, else a local wrapper — `renderHook` local wrapper is allowed per `web-testing.md`).

```tsx
import { waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { WorkspaceListRow, WorkspaceId } from '@shared/types';

import { fetchWorkspacesList } from './api';
import { useWorkspacesList } from './useWorkspacesList';

jest.mock('./api');
const mockedFetch = fetchWorkspacesList as jest.MockedFunction<typeof fetchWorkspacesList>;

const row: WorkspaceListRow = {
  id: '00000000-0000-4000-8000-0000000000aa' as WorkspaceId,
  name: 'Litigation',
  kind: 'pg-dept',
  prefix: 'LIT',
  ownerDisplayName: 'Grace Lin',
  memberCount: 64,
  provisionedAt: '2026-07-01T00:00:00Z',
  isArchived: false,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

it('useWorkspacesList — resolves — returns the rows', async () => {
  // Arrange
  mockedFetch.mockResolvedValue([row]);

  // Act
  const { result } = renderHook(() => useWorkspacesList(), { wrapper });

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([row]);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd web && npx jest useWorkspacesList --watch=false`
Expected: FAIL — `useWorkspacesList` not found.

- [ ] **Step 4: Write the hook**

Create `web/src/features/platform-admin/useWorkspacesList.ts`:

```ts
// TanStack Query read for the Platform → Workspaces list (S38). Platform-admin-gated server-side; a
// non-admin never reaches this (PlatformGate courtesy). Bounded reference list — not paginated.

import { useQuery } from '@tanstack/react-query';

import type { WorkspaceListRow } from '@shared/types';

import { fetchWorkspacesList } from './api';

export const WORKSPACES_LIST_QUERY_KEY = ['workspaces', 'list'] as const;

export function useWorkspacesList() {
  return useQuery<WorkspaceListRow[]>({
    queryKey: WORKSPACES_LIST_QUERY_KEY,
    queryFn: ({ signal }) => fetchWorkspacesList(signal),
  });
}
```

- [ ] **Step 5: Run the test**

Run: `cd web && npx jest useWorkspacesList --watch=false`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/features/platform-admin/api.ts web/src/features/platform-admin/useWorkspacesList.ts web/src/features/platform-admin/useWorkspacesList.test.tsx
git commit -m "feat(web): useWorkspacesList query hook + fetchWorkspacesList"
```

---

## Task 5: `WorkspacesListPage` + styles + test

**Files:**
- Create: `web/src/features/platform-admin/components/WorkspacesListPage.tsx`
- Create: `web/src/features/platform-admin/newWorkspace.css`
- Test: `web/src/features/platform-admin/components/WorkspacesListPage.test.tsx`

**Interfaces:**
- Consumes: `useWorkspacesList` (Task 4), `PlatformGate`, `TableShell`, `StatusPill`, `Button`, `formatDate`.
- Produces: `WorkspacesListPage` (default-less named export), routed at `/platform/workspaces` (Task 8).

- [ ] **Step 1: Write the failing test**

Create `web/src/features/platform-admin/components/WorkspacesListPage.test.tsx`. Mock `./api`'s `fetchWorkspacesList` and `@/features/users/api`'s `fetchMe` (PlatformGate reads `/users/me` — see the announcements-page test gotcha in memory). Cover: populated table (row cells: name, "PG/Dept"/"Hub", prefix, owner, member count, formatted date, status label), loading state, error state, and the New workspace button navigating to `/platform/workspaces/new`. Run axe on populated + loading + error.

```tsx
import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MeDto, WorkspaceId, WorkspaceListRow } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';
import { fetchMe } from '@/features/users/api';

import { fetchWorkspacesList } from '../api';
import { WorkspacesListPage } from './WorkspacesListPage';

jest.mock('../api');
jest.mock('@/features/users/api');
const mockedList = fetchWorkspacesList as jest.MockedFunction<typeof fetchWorkspacesList>;
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;

const rows: WorkspaceListRow[] = [
  { id: '1' as WorkspaceId, name: 'AI Solutions', kind: 'ai-solutions', prefix: 'AIS',
    ownerDisplayName: 'Priya Raman', memberCount: 127, provisionedAt: '2026-01-01T00:00:00Z', isArchived: false },
  { id: '2' as WorkspaceId, name: 'Tax', kind: 'pg-dept', prefix: 'TAX',
    ownerDisplayName: null, memberCount: 31, provisionedAt: '2026-05-14T00:00:00Z', isArchived: true },
];

function renderPage(me: MeDto = buildMe({ isPlatformAdmin: true })) {
  mockedFetchMe.mockResolvedValue(me);
  return renderWithProviders(<WorkspacesListPage />, { seedMe: me });
}

beforeEach(() => jest.clearAllMocks());

it('WorkspacesListPage — admin with rows — renders the rich table', async () => {
  // Arrange
  mockedList.mockResolvedValue(rows);

  // Act
  const { container } = renderPage();

  // Assert
  expect(await screen.findByText('AI Solutions')).toBeInTheDocument();
  expect(screen.getByText('Hub')).toBeInTheDocument();
  expect(screen.getByText('PG/Dept')).toBeInTheDocument();
  expect(screen.getByText('Priya Raman')).toBeInTheDocument();
  expect(screen.getByText('Archived')).toBeInTheDocument();
  expect(screen.getByText('Active')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('WorkspacesListPage — error — shows a retryable alert', async () => {
  // Arrange
  mockedList.mockRejectedValue(new Error('boom'));

  // Act
  const { container } = renderPage();

  // Assert
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('WorkspacesListPage — New workspace button — links to the wizard', async () => {
  // Arrange
  mockedList.mockResolvedValue(rows);
  const user = userEvent.setup();

  // Act
  renderPage();
  const link = await screen.findByRole('link', { name: /new workspace/i });

  // Assert
  expect(link).toHaveAttribute('href', '/platform/workspaces/new');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx jest WorkspacesListPage --watch=false`
Expected: FAIL — component missing.

- [ ] **Step 3: Write the styles**

Create `web/src/features/platform-admin/newWorkspace.css` (list-header portion; wizard portion added in Task 7). Tokens only:

```css
/* Platform → Workspaces list header (S38). */
.wsl-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}
.wsl-header__lead {
  color: var(--text-secondary);
  max-width: 60ch;
  margin-top: var(--space-2);
}
.wsl-header__action {
  flex-shrink: 0;
}
.wsl-owner--empty {
  color: var(--text-secondary);
}
@media (max-width: 640px) {
  .wsl-header {
    flex-direction: column;
  }
}
```

- [ ] **Step 4: Write the component**

Create `web/src/features/platform-admin/components/WorkspacesListPage.tsx`:

```tsx
// Platform → Workspaces list (S38). A rich TableShell of every workspace (Hub + PG/Depts, excluding
// the clone template) with a New workspace primary action → the full-screen wizard. Read-only here;
// row editing/archiving is out of scope. PlatformGate is the UI courtesy; the API is the boundary.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';

import type { WorkspaceKind } from '@shared/types';

import { StatusPill } from '@/shared/components/Feedback';
import { TableShell, type TableColumn, type TableRow } from '@/shared/components/Table/TableShell';
import { formatDate } from '@/shared/utils/dateFormat';

import { PlatformGate } from './PlatformGate';
import { useWorkspacesList } from '../useWorkspacesList';
import '../newWorkspace.css';

const COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Workspace', flex: true },
  { key: 'kind', label: 'Kind' },
  { key: 'prefix', label: 'ID Prefix' },
  { key: 'owner', label: 'Owner' },
  { key: 'members', label: 'Members', align: 'right' },
  { key: 'provisioned', label: 'Provisioned' },
  { key: 'status', label: 'Status' },
];

const KIND_LABEL: Record<WorkspaceKind, string> = {
  'ai-solutions': 'Hub',
  'pg-dept': 'PG/Dept',
  'pg-dept-template': 'Template', // excluded server-side; mapped for completeness
};

const EM_DASH = '—';

function WorkspacesTable() {
  const query = useWorkspacesList();

  const rows = useMemo<TableRow[]>(
    () =>
      (query.data ?? []).map((workspace) => ({
        id: workspace.id,
        cells: [
          <span className="wsl-name">{workspace.name}</span>,
          KIND_LABEL[workspace.kind],
          <span className="mono">{workspace.prefix}</span>,
          workspace.ownerDisplayName ?? <span className="wsl-owner--empty">{EM_DASH}</span>,
          workspace.memberCount,
          formatDate(workspace.provisionedAt),
          <StatusPill
            status={workspace.isArchived ? 'info' : 'success'}
            label={workspace.isArchived ? 'Archived' : 'Active'}
          />,
        ],
      })),
    [query.data],
  );

  if (query.isLoading) {
    return (
      <p className="caption" role="status">
        Loading workspaces…
      </p>
    );
  }

  if (query.isError) {
    return (
      <p className="mws-alert mws-alert--error" role="alert">
        Workspaces could not be loaded. Try again in a moment.
      </p>
    );
  }

  return <TableShell caption="Workspaces" columns={COLUMNS} rows={rows} />;
}

export function WorkspacesListPage() {
  return (
    <PlatformGate>
      <div className="wsl-header">
        <div>
          <p className="wsl-header__lead body">
            Every practice group or department gets its own workspace, provisioned from a base
            template. The hub workspace aggregates records across all of them.
          </p>
        </div>
        <Link to="/platform/workspaces/new" className="mws-btn mws-btn--primary wsl-header__action" data-ds="btn">
          <Plus size={18} weight="regular" aria-hidden /> New workspace
        </Link>
      </div>
      <WorkspacesTable />
    </PlatformGate>
  );
}
```

> The surface title "Workspaces" is rendered by `SideNavLayout` from `platformNav.ts` (updated in Task 7) — the page does not render its own `<h1>` (matches the other platform surfaces). The lead here is the descriptive paragraph.

- [ ] **Step 5: Run the tests + typecheck**

Run: `cd web && npx jest WorkspacesListPage --watch=false && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/features/platform-admin/components/WorkspacesListPage.tsx web/src/features/platform-admin/components/WorkspacesListPage.test.tsx web/src/features/platform-admin/newWorkspace.css
git commit -m "feat(web): Platform Workspaces list page"
```

---

## Task 6: Static Review-step data module

**Files:**
- Create: `web/src/features/platform-admin/newWorkspaceTemplate.ts`

**Interfaces:**
- Produces: `PGDEPT_TEMPLATE` (typed constant) — consumed by Task 7's Review step.

- [ ] **Step 1: Write the data module**

Create `web/src/features/platform-admin/newWorkspaceTemplate.ts`. This is the static presentational content for the single PG/Dept template (decision: static, not queried). Copy verbatim from the prototype's Review screen.

```ts
// Static description of the one base template (PG/Dept) shown on the New workspace wizard's Review
// step. There is exactly one template today; this is presentational copy, not a live query of the
// template workspace's schema. Enumerable lists are module-level constants (web-component-architecture.md).

export interface TemplateObjectSummary {
  name: string;
  description: string;
  fieldCount: number;
}

export interface TemplateNotableField {
  name: string;
  type: string;
  object: string;
}

export interface TemplateGate {
  name: string;
  transition: string;
  approvers: string[];
}

export interface TemplateRelationship {
  label: string;
  cardinality: string;
}

export interface TemplateAccessLevel {
  name: string;
  description: string;
}

export interface TemplateSampleRecord {
  id: string;
  title: string;
  stage: string;
}

export interface WorkspaceTemplate {
  key: string;
  name: string;
  recommended: boolean;
  tagline: string;
  metaLine: string;
  blurb: string;
  objects: TemplateObjectSummary[];
  notableFields: TemplateNotableField[];
  moreFieldsCount: number;
  lifecycleName: string;
  stages: string[];
  gates: TemplateGate[];
  relationships: TemplateRelationship[];
  savedViews: string[];
  dashboards: { name: string; widgetCount: number }[];
  accessLevels: TemplateAccessLevel[];
  sampleRecords: TemplateSampleRecord[];
}

export const PGDEPT_TEMPLATE: WorkspaceTemplate = {
  key: 'pg-dept',
  name: 'PG/Dept Template',
  recommended: true,
  tagline: 'The standard AI-solutions delivery workspace.',
  metaLine: '3 objects · 7-stage lifecycle · 5 views',
  blurb:
    'Mirrors how Litigation and M&A run today — requests come in, break into delivery tasks, and move through a gated build lifecycle. The best starting point for a practice group adopting the platform.',
  objects: [
    { name: 'Requests', description: 'Core intake record', fieldCount: 12 },
    { name: 'Tasks', description: 'Delivery work, grouped by build phase', fieldCount: 6 },
    { name: 'Attachments', description: 'Files linked to a request or task', fieldCount: 2 },
  ],
  notableFields: [
    { name: 'Stage', type: 'Single-select', object: 'Request' },
    { name: 'Priority score', type: 'Number', object: 'Request' },
    { name: 'Analyst', type: 'Link to record', object: 'Request' },
    { name: 'Due date', type: 'Date', object: 'Request' },
    { name: 'Hold / Blocked', type: 'Boolean', object: 'Request' },
    { name: 'Repo URL', type: 'URL', object: 'Task' },
  ],
  moreFieldsCount: 14,
  lifecycleName: 'Standard delivery',
  stages: ['Intake', 'Triage', 'Execution', 'Validation', 'Delivery', 'Stabilization', 'Closure'],
  gates: [
    {
      name: 'Validation readiness gate',
      transition: 'Execution → Validation',
      approvers: ['InfoSec', 'AI Solutions Manager', 'PG/Dept Lead'],
    },
    {
      name: 'Stabilization readiness gate',
      transition: 'Delivery → Stabilization',
      approvers: ['AI Solutions Manager', 'GCO'],
    },
  ],
  relationships: [
    { label: 'Request has Tasks', cardinality: '1:many' },
    { label: 'Request has Attachments', cardinality: '1:many' },
  ],
  savedViews: ['All requests', 'My queue', 'Inflight build', 'Blocked', 'Awaiting gate'],
  dashboards: [
    { name: 'Delivery overview', widgetCount: 5 },
    { name: 'Intake health', widgetCount: 4 },
  ],
  accessLevels: [
    { name: 'Viewer', description: 'Read-only across the workspace' },
    { name: 'Member', description: 'Create and work requests and tasks' },
    { name: 'Workspace admin', description: 'Configure fields, lifecycle, and access' },
  ],
  sampleRecords: [
    { id: 'REQ-00000001', title: 'Contract clause extractor', stage: 'Execution' },
    { id: 'REQ-00000002', title: 'Intake triage assistant', stage: 'Triage' },
    { id: 'REQ-00000003', title: 'Weekly status digest', stage: 'Intake' },
  ],
};
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/features/platform-admin/newWorkspaceTemplate.ts
git commit -m "feat(web): static PG/Dept template data for New workspace review step"
```

---

## Task 7: `NewWorkspacePage` full-screen wizard + styles + nav/exports + delete old wizard

**Files:**
- Create: `web/src/features/platform-admin/components/NewWorkspacePage.tsx`
- Test: `web/src/features/platform-admin/components/NewWorkspacePage.test.tsx`
- Modify: `web/src/features/platform-admin/newWorkspace.css` (wizard portion)
- Modify: `web/src/features/platform-admin/index.ts`
- Modify: `web/src/features/platform-admin/platformNav.ts`
- Delete: `web/src/features/platform-admin/components/WorkspaceProvisioningPage.tsx` + `.test.tsx`

**Interfaces:**
- Consumes: `PGDEPT_TEMPLATE` (Task 6), `useProvisionWorkspace` + `provisionWorkspace` (existing), `Stepper`, `Button`, `TextField`, `problemMessage`, `usePlatformAdmin`.
- Produces: `NewWorkspacePage`, routed full-screen at `/platform/workspaces/new` (Task 8).

- [ ] **Step 1: Write the failing test**

Create `web/src/features/platform-admin/components/NewWorkspacePage.test.tsx`. Mock `../api` (`provisionWorkspace`) and `@/features/users/api` (`fetchMe`). Cover: step 1 shows the template card + Continue; advancing to Review shows objects/stages; advancing to Details shows the three fields; submitting calls `provisionWorkspace` with `{ name, prefix, initialAdminEmail }`; success navigates to `/platform/workspaces`; API error surfaces inline. Run axe on each of the three step states + the error state. Use `renderWithProviders` with an initial route of `/platform/workspaces/new` and a catch route for `/platform/workspaces` to assert navigation (renderWithProviders supports `initialEntries` — confirm signature; else wrap in `MemoryRouter`).

```tsx
import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MeDto, WorkspaceId, WorkspaceProvisionResult } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';
import { fetchMe } from '@/features/users/api';

import { provisionWorkspace } from '../api';
import { NewWorkspacePage } from './NewWorkspacePage';

jest.mock('../api');
jest.mock('@/features/users/api');
const mockedProvision = provisionWorkspace as jest.MockedFunction<typeof provisionWorkspace>;
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;

const provisioned: WorkspaceProvisionResult = {
  id: '00000000-0000-4000-8000-0000000000cc' as WorkspaceId,
  name: 'Employment',
  kind: 'pg-dept',
  prefix: 'EMP',
};

function renderWizard(me: MeDto = buildMe({ isPlatformAdmin: true })) {
  mockedFetchMe.mockResolvedValue(me);
  return renderWithProviders(<NewWorkspacePage />, { seedMe: me });
}

async function advanceToDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /continue/i })); // Template → Review
  await user.click(await screen.findByRole('button', { name: /continue/i })); // Review → Details
}

beforeEach(() => jest.clearAllMocks());

it('NewWorkspacePage — template step — shows the recommended template card', async () => {
  // Arrange + Act
  const { container } = renderWizard();

  // Assert
  expect(await screen.findByText(/PG\/Dept Template/i)).toBeInTheDocument();
  expect(screen.getByText(/recommended/i)).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('NewWorkspacePage — review step — lists the template objects', async () => {
  // Arrange
  const user = userEvent.setup();

  // Act
  const { container } = renderWizard();
  await user.click(await screen.findByRole('button', { name: /continue/i }));

  // Assert
  expect(await screen.findByText('Requests')).toBeInTheDocument();
  expect(screen.getByText('Attachments')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('NewWorkspacePage — create — provisions and navigates to the list', async () => {
  // Arrange
  mockedProvision.mockResolvedValue(provisioned);
  const user = userEvent.setup();

  // Act
  renderWizard();
  await advanceToDetails(user);
  await user.type(screen.getByLabelText(/workspace name/i), 'Employment');
  await user.type(screen.getByLabelText(/workspace owner/i), 'admin@mws.ai');
  await user.type(screen.getByLabelText(/record id prefix/i), 'emp');
  await user.click(screen.getByRole('button', { name: /create workspace/i }));

  // Assert
  await waitFor(() =>
    expect(mockedProvision).toHaveBeenCalledWith({
      name: 'Employment',
      prefix: 'EMP',
      initialAdminEmail: 'admin@mws.ai',
    }),
  );
});

it('NewWorkspacePage — API error — surfaces inline on the details step', async () => {
  // Arrange
  mockedProvision.mockRejectedValue(new Error('Prefix already in use.'));
  const user = userEvent.setup();

  // Act
  const { container } = renderWizard();
  await advanceToDetails(user);
  await user.type(screen.getByLabelText(/workspace name/i), 'Employment');
  await user.type(screen.getByLabelText(/workspace owner/i), 'admin@mws.ai');
  await user.type(screen.getByLabelText(/record id prefix/i), 'emp');
  await user.click(screen.getByRole('button', { name: /create workspace/i }));

  // Assert
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});
```

> If `renderWithProviders`/`buildMe` signatures differ from those used in `WorkspaceProvisioningPage.test.tsx`, mirror that file exactly — it is the canonical example for platform-page tests.

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx jest NewWorkspacePage --watch=false`
Expected: FAIL — component missing.

- [ ] **Step 3: Add the wizard styles**

Append to `web/src/features/platform-admin/newWorkspace.css` (tokens only; full-screen focused flow):

```css
/* New workspace — full-screen wizard (no app shell / side nav). */
.nww {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
  overflow-y: auto;
}
.nww__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-7);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-light);
}
.nww__eyebrow {
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.nww__title {
  font-family: var(--font-mix);
  font-size: 32px;
  line-height: 1.1;
  margin-top: var(--space-1);
}
.nww__stepper {
  flex: 1;
  display: flex;
  justify-content: center;
  padding-top: var(--space-3);
}
.nww__close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--icon-default);
  cursor: pointer;
  border-radius: 2px;
}
.nww__close:hover {
  color: var(--accent-interactive);
}
.nww__body {
  flex: 1;
  padding: var(--space-7);
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  min-width: 0;
}
.nww__step-title {
  font-family: var(--font-mix);
  font-size: 24px;
  margin-bottom: var(--space-2);
}
.nww__step-lead {
  color: var(--text-secondary);
  max-width: 60ch;
  margin-bottom: var(--space-5);
}
.nww__footer {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  justify-content: flex-end;
  padding: var(--space-4) var(--space-7);
  background: var(--bg-surface);
  border-top: 1px solid var(--border-light);
  position: sticky;
  bottom: 0;
}
.nww__footer-spacer {
  margin-right: auto;
}
/* Template card */
.nww-card {
  display: block;
  text-align: left;
  width: 100%;
  max-width: 340px;
  border: 1.5px solid var(--border-light);
  border-radius: 2px;
  background: var(--bg-surface);
  padding: var(--space-4);
  cursor: pointer;
}
.nww-card[aria-checked='true'] {
  border-color: var(--accent-interactive);
}
.nww-card__badge {
  display: inline-block;
  background: var(--color-pale-success);
  color: var(--color-navy);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px var(--space-2);
  border-radius: 999px;
  margin: var(--space-2) 0;
}
.nww-card__meta {
  color: var(--text-secondary);
  font-size: 13px;
  border-top: 1px solid var(--border-light);
  padding-top: var(--space-3);
  margin-top: var(--space-3);
}
/* Review panel */
.nww-review {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: var(--space-4);
}
.nww-review__card {
  border: 1px solid var(--border-light);
  border-radius: 2px;
  background: var(--bg-surface);
  padding: var(--space-4);
}
.nww-review__eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: var(--space-3);
}
.nww-review__row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-1) 0;
}
.nww-review__muted {
  color: var(--text-secondary);
}
.nww-chip {
  display: inline-block;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  padding: 2px var(--space-3);
  margin: 0 var(--space-1) var(--space-1) 0;
  font-size: 13px;
}
.nww-form {
  max-width: 560px;
}
@media (max-width: 768px) {
  .nww__header { flex-wrap: wrap; }
  .nww__stepper { order: 3; width: 100%; justify-content: flex-start; }
  .nww__body, .nww__header, .nww__footer { padding-left: var(--space-4); padding-right: var(--space-4); }
}
```

- [ ] **Step 4: Write the wizard component**

Create `web/src/features/platform-admin/components/NewWorkspacePage.tsx`. Reuse the existing `useProvisionWorkspace` mutation and `WORKSPACES_LIST_QUERY_KEY` for invalidation.

```tsx
// New workspace — full-screen wizard (S38). Template → Review → Details. Renders outside the app
// shell and platform side nav (a standalone flow owns the whole surface; steppers-and-wizards.md).
// Reuses the existing provisioning endpoint unchanged. Platform-admin is enforced server-side; a
// non-admin who reaches the URL sees the gate message and no form.

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/shared/components/Button';
import { TextField } from '@/shared/components/Form';
import { Stepper } from '@/shared/components/Feedback';
import { problemMessage } from '@/shared/http/problemMessage';

import { usePlatformAdmin } from '../usePlatformAdmin';
import { useProvisionWorkspace } from '../useWorkspaceProvisioning';
import { WORKSPACES_LIST_QUERY_KEY } from '../useWorkspacesList';
import { PGDEPT_TEMPLATE } from '../newWorkspaceTemplate';
import '../newWorkspace.css';

const STEPS = [{ label: 'Template' }, { label: 'Review' }, { label: 'Details' }];
const PREFIX_PATTERN = /^[A-Za-z0-9]{2,16}$/;
const LIST_ROUTE = '/platform/workspaces';

function TemplateStep() {
  return (
    <>
      <h2 className="nww__step-title">Choose a base template</h2>
      <p className="nww__step-lead">
        Every template provisions its own objects, fields, relationships, lifecycle, views,
        dashboards, and access levels. The workspace owner can change any of it afterward — templates
        are a starting point, not a lock-in.
      </p>
      <div
        role="radio"
        aria-checked="true"
        tabIndex={0}
        className="nww-card"
        data-ds="card"
      >
        <strong>{PGDEPT_TEMPLATE.name}</strong>
        <div>
          <span className="nww-card__badge">Recommended</span>
        </div>
        <p className="nww-review__muted">{PGDEPT_TEMPLATE.tagline}</p>
        <div className="nww-card__meta">{PGDEPT_TEMPLATE.metaLine}</div>
      </div>
    </>
  );
}

function ReviewStep() {
  const template = PGDEPT_TEMPLATE;
  return (
    <>
      <h2 className="nww__step-title">{template.name}</h2>
      <p className="nww__step-lead">{template.blurb}</p>
      <div className="nww-review">
        <section className="nww-review__card" aria-label="Objects">
          <p className="nww-review__eyebrow">Objects</p>
          {template.objects.map((object) => (
            <div className="nww-review__row" key={object.name}>
              <span>
                <strong>{object.name}</strong>
                <br />
                <span className="nww-review__muted">{object.description}</span>
              </span>
              <span className="nww-review__muted">{object.fieldCount} fields</span>
            </div>
          ))}
        </section>

        <section className="nww-review__card" aria-label="Notable fields">
          <p className="nww-review__eyebrow">Notable fields</p>
          {template.notableFields.map((field) => (
            <div className="nww-review__row" key={`${field.object}-${field.name}`}>
              <span>{field.name}</span>
              <span className="nww-review__muted">
                {field.type} · {field.object}
              </span>
            </div>
          ))}
          <p className="nww-review__muted">+{template.moreFieldsCount} more across these objects</p>
        </section>

        <section className="nww-review__card" aria-label="Lifecycle and gates">
          <p className="nww-review__eyebrow">Lifecycle &amp; gates</p>
          <strong>{template.lifecycleName}</strong>
          <div>
            {template.stages.map((stage) => (
              <span className="nww-chip" key={stage}>
                {stage}
              </span>
            ))}
          </div>
          {template.gates.map((gate) => (
            <div className="nww-review__row" key={gate.name}>
              <span>
                <strong>{gate.name}</strong>
                <br />
                <span className="nww-review__muted">{gate.transition}</span>
                <br />
                {gate.approvers.map((approver) => (
                  <span className="nww-chip" key={approver}>
                    {approver}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </section>

        <section className="nww-review__card" aria-label="Relationships">
          <p className="nww-review__eyebrow">Relationships</p>
          {template.relationships.map((relationship) => (
            <div className="nww-review__row" key={relationship.label}>
              <span>{relationship.label}</span>
              <span className="nww-chip">{relationship.cardinality}</span>
            </div>
          ))}
        </section>

        <section className="nww-review__card" aria-label="Saved views">
          <p className="nww-review__eyebrow">Saved views</p>
          {template.savedViews.map((view) => (
            <span className="nww-chip" key={view}>
              {view}
            </span>
          ))}
        </section>

        <section className="nww-review__card" aria-label="Dashboards">
          <p className="nww-review__eyebrow">Dashboards</p>
          {template.dashboards.map((dashboard) => (
            <div className="nww-review__row" key={dashboard.name}>
              <span>{dashboard.name}</span>
              <span className="nww-review__muted">{dashboard.widgetCount} widgets</span>
            </div>
          ))}
        </section>

        <section className="nww-review__card" aria-label="Access levels">
          <p className="nww-review__eyebrow">Access levels</p>
          {template.accessLevels.map((level) => (
            <div className="nww-review__row" key={level.name}>
              <span>
                <strong>{level.name}</strong>
              </span>
              <span className="nww-review__muted">{level.description}</span>
            </div>
          ))}
        </section>

        <section className="nww-review__card" aria-label="Sample records">
          <p className="nww-review__eyebrow">Sample records</p>
          {template.sampleRecords.map((record) => (
            <div className="nww-review__row" key={record.id}>
              <span>
                <span className="mono">{record.id}</span> {record.title}
              </span>
              <span className="nww-review__muted">{record.stage}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function WizardBody() {
  const provision = useProvisionWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [prefix, setPrefix] = useState('');

  const trimmedName = name.trim();
  const trimmedEmail = ownerEmail.trim();
  const upperPrefix = prefix.trim().toUpperCase();
  const prefixValid = PREFIX_PATTERN.test(prefix.trim());
  const detailsValid = trimmedName.length > 0 && trimmedEmail.length > 0 && prefixValid;

  const close = () => navigate(LIST_ROUTE);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step < 2) {
      setStep((prev) => prev + 1);
      return;
    }
    if (!detailsValid) return;
    provision.mutate(
      { name: trimmedName, prefix: upperPrefix, initialAdminEmail: trimmedEmail },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: WORKSPACES_LIST_QUERY_KEY });
          navigate(LIST_ROUTE);
        },
      },
    );
  };

  return (
    <form className="nww" onSubmit={onSubmit} aria-label="New workspace">
      <header className="nww__header">
        <div>
          <p className="nww__eyebrow">Platform settings</p>
          <h1 className="nww__title">New workspace</h1>
        </div>
        <div className="nww__stepper">
          <Stepper steps={STEPS} currentIndex={step} />
        </div>
        <button type="button" className="nww__close" aria-label="Close" onClick={close}>
          <X size={20} weight="regular" aria-hidden />
        </button>
      </header>

      <div className="nww__body">
        {step === 0 && <TemplateStep />}
        {step === 1 && <ReviewStep />}
        {step === 2 && (
          <div className="nww-form">
            <h2 className="nww__step-title">Name the workspace</h2>
            <p className="nww__step-lead">
              Provisioning from the {PGDEPT_TEMPLATE.name} template. You can rename it or change any
              configuration once it’s created.
            </p>
            <TextField label="Workspace name" value={name} onChange={setName} placeholder="Employment" />
            <TextField
              label="Workspace owner"
              value={ownerEmail}
              onChange={setOwnerEmail}
              placeholder="owner@mwe.com"
              autoComplete="email"
              hint="The owner gets the first Workspace admin access level. Enter their firm email."
            />
            <TextField
              label="Record ID prefix"
              value={prefix}
              onChange={setPrefix}
              placeholder="EMP"
              hint="Prepended to every record ID — records will look like EMP-00001024."
              error={
                prefix.trim().length > 0 && !prefixValid
                  ? 'Prefix must be 2–16 letters or digits.'
                  : undefined
              }
            />
            {provision.isError && (
              <p className="mws-alert mws-alert--error" role="alert">
                {problemMessage(provision.error)}
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="nww__footer">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={() => setStep((prev) => prev - 1)}>
            Back
          </Button>
        )}
        <span className="nww__footer-spacer" />
        <Button type="button" variant="secondary" onClick={close}>
          Cancel
        </Button>
        {step < 2 && <Button type="submit">Continue</Button>}
        {step === 2 && (
          <Button type="submit" disabled={!detailsValid || provision.isPending}>
            {provision.isPending ? 'Creating…' : 'Create workspace'}
          </Button>
        )}
      </footer>
    </form>
  );
}

export function NewWorkspacePage() {
  const { isPlatformAdmin, isLoading, isError } = usePlatformAdmin();

  if (isLoading) {
    return (
      <div className="platform-admin">
        <p className="caption" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (isError || !isPlatformAdmin) {
    return (
      <div className="platform-admin">
        <p className="mws-alert mws-alert--warning" role="alert">
          This page is available to platform admins. Ask the AI Solutions Lead if you need access.
        </p>
      </div>
    );
  }

  return <WizardBody />;
}
```

> `data-ds="card"` is applied to the template card so the design-fidelity gate can pair it with the prototype. The radio pattern is a single selectable option today; keyboard activation is a no-op (only one option) but the semantics are correct for when more templates land.

- [ ] **Step 5: Update exports and nav; delete the old wizard**

In `web/src/features/platform-admin/index.ts`: remove the `WorkspaceProvisioningPage` export; add:

```ts
export { WorkspacesListPage } from './components/WorkspacesListPage';
export { NewWorkspacePage } from './components/NewWorkspacePage';
```

In `web/src/features/platform-admin/platformNav.ts`, update the Workspaces entry lead (title stays "Workspace provisioning" or change to "Workspaces" to match the list header — set title to `'Workspaces'`):

```ts
  {
    to: '/platform/workspaces',
    label: 'Workspaces',
    title: 'Workspaces',
    lead: 'Every practice group or department has its own workspace, provisioned from a base template. Stand up a new one, or review the ones that exist.',
  },
```

Delete the old files:

```bash
git rm web/src/features/platform-admin/components/WorkspaceProvisioningPage.tsx web/src/features/platform-admin/components/WorkspaceProvisioningPage.test.tsx
```

- [ ] **Step 6: Run the tests + typecheck**

Run: `cd web && npx jest NewWorkspacePage --watch=false && npx tsc --noEmit`
Expected: PASS, no type errors. (Note: `useWorkspaceProvisioning.ts` and `api.ts`'s `provisionWorkspace` remain — do not delete them.)

- [ ] **Step 7: Commit**

```bash
git add web/src/features/platform-admin/
git commit -m "feat(web): full-screen New workspace wizard; retire old provisioning page"
```

---

## Task 8: Route wiring in `App.tsx`

**Files:**
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `WorkspacesListPage`, `NewWorkspacePage` (Task 7 exports).

- [ ] **Step 1: Update imports**

In the `@/features/platform-admin` import block (around line 47–49), replace `WorkspaceProvisioningPage` with `WorkspacesListPage` and `NewWorkspacePage`.

- [ ] **Step 2: Point the nested list route at the new page**

Change line 120 inside the `<Route path="/platform" element={<PlatformLayout />}>` block:

```tsx
<Route path="workspaces" element={<WorkspacesListPage />} />
```

- [ ] **Step 3: Add the full-screen wizard as a sibling OUTSIDE the AppShell**

Add this route as a **direct child of `<Routes>`**, as a sibling to `<Route element={<AppShell />}>` (e.g. immediately before that line, ~line 97), so the wizard renders with no app shell and no platform side nav:

```tsx
<Route path="/platform/workspaces/new" element={<NewWorkspacePage />} />
```

React Router v6 ranks the exact static path above the AppShell layout's nested routes, so `/platform/workspaces/new` resolves to the full-screen wizard, not the list.

- [ ] **Step 4: Typecheck + targeted route test**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(web): route workspaces list + full-screen new-workspace wizard"
```

---

## Task 9: Playwright E2E

**Files:**
- Create: `web/e2e/platform-workspaces.spec.ts`

**Interfaces:**
- Consumes: the running app (dev auth bypass per `dev-local-testing`), the routes from Task 8.

- [ ] **Step 1: Write the E2E**

Model on `web/e2e/platform-announcements.spec.ts` (same auth/setup). Cover: navigate to `/platform/workspaces`, see the table + New workspace button; click New workspace → full-screen wizard at `/platform/workspaces/new`; step Template → Review → Details; fill name/owner/prefix; Create; land back on `/platform/workspaces`. Use role/label/text locators (no CSS selectors), per `web-testing.md`.

```ts
import { test, expect } from '@playwright/test';

test.describe('Platform → Workspaces', () => {
  test('list → new workspace wizard → create → back to list', async ({ page }) => {
    await page.goto('/platform/workspaces');

    await expect(page.getByRole('link', { name: /new workspace/i })).toBeVisible();
    await page.getByRole('link', { name: /new workspace/i }).click();

    await expect(page).toHaveURL(/\/platform\/workspaces\/new$/);
    await expect(page.getByText(/PG\/Dept Template/i)).toBeVisible();

    await page.getByRole('button', { name: /continue/i }).click(); // Template → Review
    await expect(page.getByText('Requests')).toBeVisible();
    await page.getByRole('button', { name: /continue/i }).click(); // Review → Details

    const unique = `E2E${Date.now().toString().slice(-6)}`;
    await page.getByLabel(/workspace name/i).fill(`E2E ${unique}`);
    await page.getByLabel(/workspace owner/i).fill('admin@mws.ai');
    await page.getByLabel(/record id prefix/i).fill(unique);
    await page.getByRole('button', { name: /create workspace/i }).click();

    await expect(page).toHaveURL(/\/platform\/workspaces$/);
  });
});
```

> The E2E depends on the dev-auth bypass making the seeded user a platform admin and `admin@mws.ai` resolving to a real seeded user. If the seed user's email differs, use the seeded platform-admin email. If prefix uniqueness/seed data blocks a real create in CI, mark this test `test.fixme` with a note and rely on the Jest coverage for the create path — do not weaken the assertions.

- [ ] **Step 2: Run locally (best-effort)**

Run: `cd web && npx playwright test platform-workspaces --project=chromium`
Expected: PASS, or a documented `fixme` per the note above.

- [ ] **Step 3: Commit**

```bash
git add web/e2e/platform-workspaces.spec.ts
git commit -m "test(e2e): platform workspaces list → new workspace flow"
```

---

## Self-Review

**Spec coverage:**
- List page (rich table) → Tasks 1–5. ✓
- Static Review content → Task 6, rendered Task 7. ✓
- Owner = email field → Task 7 Details step. ✓
- Full-screen wizard, no side nav → Task 7 (component) + Task 8 (sibling route). ✓
- Retire old wizard → Task 7 Step 5. ✓
- No schema change → only a proc (Task 1). ✓
- Platform-admin gating 403 → Task 3. ✓
- Reuse provisioning endpoint/hook → Task 7 imports existing `useProvisionWorkspace`/`provisionWorkspace`. ✓
- Tests + axe + E2E → Tasks 1,3,4,5,7,9. ✓

**Type consistency:** `WorkspaceListRow` fields identical across `shared/types/platform.ts` (Task 2), C# DTO (Task 3), and consumers (Tasks 4–5). `WORKSPACES_LIST_QUERY_KEY` defined in Task 4, consumed in Task 7. `PGDEPT_TEMPLATE` shape defined Task 6, consumed Task 7. `fetchWorkspacesList` signature consistent Tasks 3-source/4. `ListAsync(CancellationToken)` consistent between service interface, impl, controller, and test mock. ✓

**Placeholder scan:** The only illustrative block is Task 1 Step 1's first tSQLt test scaffold — flagged inline with the directive to use the clean `#captured` INSERT-EXEC form (shown fully in tests 2 and 3). No other placeholders. ✓

## Notes for the implementer

- **tSQLt cannot run locally** — CI/`/dev-review-and-remediate` runs it. Verify proc/test file presence and shape locally; rely on CI for green.
- **`renderWithProviders` / `buildMe` signatures**: `WorkspaceProvisioningPage.test.tsx` (being deleted in Task 7) is the canonical example — read it before deleting to copy the exact mocking/seed pattern into the new tests.
- **PlatformGate reads `/users/me`** — every list/wizard page test must mock `fetchMe` from `@/features/users/api` or the gate flips to error (announcements-page test gotcha).
- Do not touch `usp_ProvisionWorkspace`, `WorkspaceProvisioningService.ProvisionAsync`, `useWorkspaceProvisioning.ts`, or `provisionWorkspace()` — they are reused.
