# Announcements — workspace scoping + platform broadcast — Implementation Plan

> **For agentic workers:** This project has its own quality gates. Do **not** hand-run `git commit`
> per step (direct commits are hook-blocked). Implement each slice fully (code + tests), then run
> `/dev-review-and-remediate` until CLEAN, then `/dev-ship`. Steps use checkbox (`- [ ]`) syntax for
> tracking. Work happens in the worktree at
> `.claude/worktrees/announcements-scoping-broadcast` (branch `fix/announcements-scoping-broadcast`).

**Goal:** Scope workspace announcement authoring to the active workspace, and add a platform-admin
surface that broadcasts an announcement to all or specific workspaces by fanning out one normal
per-workspace announcement per target.

**Architecture:** Slice 1 is a web-only rebind of `ManageAnnouncementsPage` to the active workspace
(mirroring `WorkspaceAuditPage`). Slice 2 adds a nullable `BroadcastId` column, a platform workspaces
read, and platform announcement create/query/edit/retire endpoints that reuse the existing
per-workspace create + bell fan-out; a new `Platform → Announcements` page mirrors the workspace
editor plus a target picker.

**Tech Stack:** React 19 + TS + webpack + Jest/jest-axe/Playwright (web); ASP.NET Core + EF Core +
stored procs (api); Azure SQL + tSQLt (database).

## Global Constraints

- Tokens/design-system only in styles; reuse existing `ann-*` / `mws-*` classes and shared components
  (`Modal`, `Button`, `Select`, `TextField`, `TextArea`, `DateTimeField`, `TableShell`/`TableFooter`).
- Every collection endpoint paginated (POST body `{ page, pageSize, filters }`); default 20, max 100.
- Access violation → **403, never 404**. All errors are ProblemDetails (RFC 7807).
- No user content / PII in logs. Every async method takes and passes a `CancellationToken`.
- `ExecuteSqlRaw*` / `FromSqlRaw` only with `SqlParameter` — no interpolation.
- Every new/changed table gets audit columns + soft delete; every proc has `SET NOCOUNT ON;` +
  `SET XACT_ABORT ON;` + `TRY/CATCH` + header comment; migrations idempotent (`IF NOT EXISTS`) with a
  rollback file, numbered `20260724_077_...` next.
- Web components ≤200 lines (route ≤250 w/ justification); explicit loading/error/empty states;
  jest-axe on **each meaningfully different** rendered state; 80% coverage floor.
- `data-ds` on any design-system component root.

---

## SLICE 1 — Workspace active-workspace scoping (web-only)

Independently shippable. Ship this before Slice 2.

### Task 1.1: Rebind `ManageAnnouncementsPage` to the active workspace

**Files:**
- Modify: `web/src/features/announcements/components/ManageAnnouncementsPage.tsx`
- Modify: `web/src/features/announcements/components/ManageAnnouncementsPage.test.tsx`

**Interfaces:**
- Consumes: `resolveActiveWorkspaceId(memberships)` from `@/shared/workspace/activeWorkspace`;
  `useMe()` (`me.memberships` each `{ workspaceId, workspaceKind, level, workspaceName }`).
- Produces: page bound to active workspace; no exported API change.

- [ ] **Step 1: Update the test to assert active-workspace binding and no selector**

Replace the multi-workspace-selector cases. Mirror `WorkspaceAuditPage.test` expectations:

```tsx
// me has two admin memberships; the ai-solutions hub is the active one.
it('ManageAnnouncementsPage — admin of active workspace — renders the table, no selector', async () => {
  // Arrange
  mockUseMe({
    user: { id: 'u1' },
    memberships: [
      { workspaceId: 'ws-hub', workspaceKind: 'ai-solutions', workspaceName: 'AI Solutions', level: 'WorkspaceAdmin' },
      { workspaceId: 'ws-pg', workspaceKind: 'pg-dept', workspaceName: 'Litigation', level: 'WorkspaceAdmin' },
    ],
  });
  mockManagedAnnouncements('ws-hub', [buildRow({ title: 'Welcome' })]);

  // Act
  render(<ManageAnnouncementsPage />);

  // Assert — bound to the hub (active), and the workspace <select> is gone.
  expect(await screen.findByText('Welcome')).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: /workspace/i })).not.toBeInTheDocument();
  expect(mockManagedAnnouncements).toHaveBeenCalledWith('ws-hub');
});

it('ManageAnnouncementsPage — not admin of active workspace — renders the empty state', async () => {
  // Arrange
  mockUseMe({
    user: { id: 'u1' },
    memberships: [
      { workspaceId: 'ws-hub', workspaceKind: 'ai-solutions', workspaceName: 'AI Solutions', level: 'Viewer' },
    ],
  });

  // Act
  render(<ManageAnnouncementsPage />);

  // Assert
  expect(
    await screen.findByText(/you need to be a workspace admin to post announcements/i),
  ).toBeInTheDocument();
});
```
Add an axe assertion for the admin-list state, the not-admin empty state, and the loading state.

- [ ] **Step 2: Run the test — expect FAIL** (`npx jest ManageAnnouncementsPage`) because the selector
  still renders and workspace resolves from `adminMemberships[0]`.

- [ ] **Step 3: Rewrite the workspace resolution + remove the selector**

In `ManageAnnouncementsPage.tsx`:
- Replace the `adminMemberships` / `selectedWorkspaceId` / `workspaceId ?? adminMemberships[0]` logic
  with the `WorkspaceAuditPage` pattern:

```tsx
import { resolveActiveWorkspaceId } from '@/shared/workspace/activeWorkspace';

const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);
const isAdmin = useMemo(
  () =>
    (me?.memberships ?? []).some(
      (m) => m.workspaceId === workspaceId && m.level === 'WorkspaceAdmin',
    ),
  [me, workspaceId],
);
const wsId = (workspaceId ?? '') as WorkspaceId;
```
- Delete the entire `adminMemberships.length > 1` `<label className="mws-field">…<select>…</select>` block
  (lines ~170–186) and the `selectedWorkspaceId` state.
- Change the gate: `if (!workspaceId || !isAdmin)` → render the existing "you need to be a workspace
  admin to post announcements" empty state (keep the copy).
- Keep `useManagedAnnouncements(workspaceId ?? undefined)`, `useMembers`, `useCreate/UpdateAnnouncement(wsId)`
  and everything below unchanged.

- [ ] **Step 4: Run the test — expect PASS.** Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Update `AnnouncementsManageTable`/editor tests only if they referenced the selector**
  (they don't — the selector lived only in the page). Confirm `npx jest announcements` green.

### Task 1.2: E2E + ship Slice 1

- [ ] **Step 1:** Update `web/e2e/announcements.spec.ts` if it selected a workspace via the dropdown —
  remove that step; the flow now posts to the seeded active workspace directly.
- [ ] **Step 2:** Run `/dev-review-and-remediate` until CLEAN.
- [ ] **Step 3:** `/dev-ship`.

---

## SLICE 2 — Platform broadcast surface (DB + API + Web)

### Task 2.1: Migration — add `BroadcastId` to `Announcements`

**Files:**
- Create: `database/migrations/20260724_077_AddAnnouncementBroadcastId.sql`
- Create: `database/migrations/20260724_077_AddAnnouncementBroadcastId_Rollback.sql`
- Modify: `api/Api/Data/Entities.cs` (`AnnouncementRow`, `AnnouncementListRowEntity`)
- Modify: `api/Api/Data/AppDbContext.cs` (column mapping if explicit)

**Interfaces:**
- Produces: `dbo.Announcements.BroadcastId UNIQUEIDENTIFIER NULL`; `AnnouncementRow.BroadcastId Guid?`.

- [ ] **Step 1: Write the forward migration (idempotent)**

```sql
-- =============================================
-- Author: announcements-platform-broadcast · Create Date: 2026-07-24
-- Description: Adds nullable BroadcastId to dbo.Announcements. Platform broadcasts stamp one shared
--              BroadcastId across the per-workspace copies fanned out from a single post; workspace-
--              authored announcements leave it NULL. Filtered index supports the grouped platform read.
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'dbo.Announcements') AND name = N'BroadcastId')
BEGIN
    ALTER TABLE dbo.Announcements ADD BroadcastId UNIQUEIDENTIFIER NULL;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = N'IX_Announcements_BroadcastId' AND object_id = OBJECT_ID(N'dbo.Announcements'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Announcements_BroadcastId
        ON dbo.Announcements (BroadcastId)
        WHERE BroadcastId IS NOT NULL;
END;
GO
```

- [ ] **Step 2: Write the rollback**

```sql
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Announcements_BroadcastId'
           AND object_id = OBJECT_ID(N'dbo.Announcements'))
    DROP INDEX IX_Announcements_BroadcastId ON dbo.Announcements;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Announcements') AND name = N'BroadcastId')
    ALTER TABLE dbo.Announcements DROP COLUMN BroadcastId;
GO
```

- [ ] **Step 3: Apply forward migration to local dev DB** (PowerShell `Invoke-Sqlcmd`, per project convention)
  and confirm the column exists.

- [ ] **Step 4: Add `Guid? BroadcastId` to `AnnouncementRow`** in `Entities.cs` (nullable; EF maps by
  name). No change needed to `AnnouncementListRowEntity` unless the workspace manage read surfaces it —
  it doesn't; leave it.

### Task 2.2: `usp_CreateAnnouncement` — accept an optional `@BroadcastId`

**Files:**
- Modify: `database/procedures/announcements/usp_CreateAnnouncement.sql`
- Create: `database/tests/announcements/test_usp_CreateAnnouncement.sql` (extend if exists)

**Interfaces:**
- Produces: `usp_CreateAnnouncement` gains trailing `@BroadcastId UNIQUEIDENTIFIER = NULL` param, written
  to the new column. Existing callers (workspace create) pass nothing → NULL (back-compatible).

- [ ] **Step 1: tSQLt test — create with a broadcast id persists it**

```sql
CREATE PROCEDURE announcements_tests.[test CreateAnnouncement stamps BroadcastId]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = N'dbo.Announcements';
    DECLARE @Ws UNIQUEIDENTIFIER = NEWID(), @Bc UNIQUEIDENTIFIER = NEWID(), @Id UNIQUEIDENTIFIER;
    EXEC dbo.usp_CreateAnnouncement
        @WorkspaceId=@Ws, @AuthorUserId=@Ws, @Title=N'T', @Body=N'B',
        @Audience=N'{"kind":"everyone"}', @Pinned=0, @ExpiresOn=NULL, @Status=N'Published',
        @ScheduledPublishAt=NULL, @AutoArchive=1, @CreatedBy=N'u', @BroadcastId=@Bc,
        @AnnouncementId=@Id OUTPUT;
    DECLARE @Actual UNIQUEIDENTIFIER = (SELECT BroadcastId FROM dbo.Announcements WHERE AnnouncementId=@Id);
    EXEC tSQLt.AssertEquals @Bc, @Actual;
END;
```
Note: assign the `SELECT` into a variable first (this repo's tSQLt cannot compile `@Actual=(SELECT…)`
inline as an `AssertEquals` arg — the two-statement form above is required).

- [ ] **Step 2: Add the param + column write.** In `usp_CreateAnnouncement.sql`: add
  `@BroadcastId UNIQUEIDENTIFIER = NULL` as the final parameter, `DECLARE @Bc UNIQUEIDENTIFIER = @BroadcastId;`,
  add `BroadcastId` to the INSERT column list and `@Bc` to `VALUES`.

- [ ] **Step 3: Run the tSQLt class; expect PASS** (via `Invoke-Sqlcmd` runner). Confirm the existing
  workspace-create test (no `@BroadcastId`) still passes (default NULL).

### Task 2.3: `usp_QueryPlatformAnnouncements` — grouped broadcast list

**Files:**
- Create: `database/procedures/announcements/usp_QueryPlatformAnnouncements.sql`
- Create: `database/tests/announcements/test_usp_QueryPlatformAnnouncements.sql`

**Interfaces:**
- Produces: one row per `BroadcastId` (broadcasts only — `BroadcastId IS NOT NULL`). Columns:
  `BroadcastId, Title, Body(snippet), Pinned, Status, AuthorUserId, AuthorName, PostedAt,
  ScheduledPublishAt, AutoArchive, AutoArchiveAt, WorkspaceCount, TotalCount`. Aggregated from the copies
  (they share title/body/status/timestamps by construction), `WorkspaceCount = COUNT(*)`. Paginated.

- [ ] **Step 1: tSQLt test — three copies of one broadcast collapse to one row with count 3**

```sql
CREATE PROCEDURE announcements_tests.[test QueryPlatformAnnouncements groups by BroadcastId]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = N'dbo.Announcements';
    EXEC tSQLt.FakeTable @TableName = N'dbo.Users';
    DECLARE @Bc UNIQUEIDENTIFIER = NEWID();
    INSERT INTO dbo.Announcements (AnnouncementId, WorkspaceId, BroadcastId, Title, Body, Status,
        Pinned, IsDeleted, CreatedAt, PublishedAt)
    SELECT NEWID(), NEWID(), @Bc, N'Firm notice', N'Body', N'Published', 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME()
    FROM (VALUES (1),(2),(3)) AS v(n);
    EXEC tSQLt.AssertEmptyTable ... -- replace with row-count assertion below
    DECLARE @Rows INT, @Count INT;
    CREATE TABLE #r (BroadcastId UNIQUEIDENTIFIER, Title NVARCHAR(200), BodySnippet NVARCHAR(280),
        Pinned BIT, PublishedAt DATETIME2, ScheduledPublishAt DATETIME2, AutoArchive BIT,
        AutoArchiveAt DATETIME2, Status NVARCHAR(16), AuthorUserId UNIQUEIDENTIFIER,
        AuthorName NVARCHAR(256), PostedAt DATETIME2, WorkspaceCount INT, TotalCount INT);
    INSERT INTO #r EXEC dbo.usp_QueryPlatformAnnouncements @Page=1, @PageSize=20;
    SELECT @Rows = COUNT(*), @Count = MAX(WorkspaceCount) FROM #r;
    EXEC tSQLt.AssertEquals 1, @Rows;
    EXEC tSQLt.AssertEquals 3, @Count;
END;
```

- [ ] **Step 2: Write the proc** (mirror `usp_QueryAnnouncementsForManage` shape, grouped):

```sql
CREATE OR ALTER PROCEDURE dbo.usp_QueryPlatformAnnouncements
    @Page INT, @PageSize INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @PageL INT = CASE WHEN @Page < 1 THEN 1 ELSE @Page END;
    DECLARE @Size  INT = CASE WHEN @PageSize < 1 THEN 20 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;

    ;WITH b AS (
        SELECT a.BroadcastId,
               MAX(a.Title)              AS Title,
               MAX(LEFT(a.Body, 280))    AS BodySnippet,
               MAX(CONVERT(TINYINT, a.Pinned)) AS Pinned,
               MAX(a.Status)             AS Status,
               MAX(a.AuthorUserId)       AS AuthorUserId,
               MAX(a.PublishedAt)        AS PublishedAt,
               MAX(a.ScheduledPublishAt) AS ScheduledPublishAt,
               MAX(CONVERT(TINYINT, a.AutoArchive)) AS AutoArchive,
               MAX(a.AutoArchiveAt)      AS AutoArchiveAt,
               MAX(a.CreatedAt)          AS CreatedAt,
               COUNT(*)                  AS WorkspaceCount
        FROM dbo.Announcements AS a
        WHERE a.BroadcastId IS NOT NULL AND a.IsDeleted = 0
        GROUP BY a.BroadcastId
    )
    SELECT b.BroadcastId, b.Title, b.BodySnippet, CONVERT(BIT, b.Pinned) AS Pinned,
           b.PublishedAt, b.ScheduledPublishAt, CONVERT(BIT, b.AutoArchive) AS AutoArchive,
           b.AutoArchiveAt, b.Status, b.AuthorUserId, u.DisplayName AS AuthorName,
           COALESCE(b.PublishedAt, b.ScheduledPublishAt, b.CreatedAt) AS PostedAt,
           b.WorkspaceCount,
           COUNT(*) OVER () AS TotalCount
    FROM b
    LEFT JOIN dbo.Users AS u ON u.UserId = b.AuthorUserId
    ORDER BY b.Pinned DESC, COALESCE(b.PublishedAt, b.ScheduledPublishAt, b.CreatedAt) DESC, b.BroadcastId DESC
    OFFSET (@PageL - 1) * @Size ROWS FETCH NEXT @Size ROWS ONLY;
END;
GO
```

- [ ] **Step 3: Run the tSQLt class; expect PASS.**

### Task 2.4: `usp_UpdateBroadcast` and `usp_RetireBroadcast`

**Files:**
- Create: `database/procedures/announcements/usp_UpdateBroadcast.sql`
- Create: `database/procedures/announcements/usp_RetireBroadcast.sql`
- Create: `database/tests/announcements/test_usp_Broadcast_mutations.sql`

**Interfaces:**
- Produces: `usp_UpdateBroadcast @BroadcastId, @Title, @Body, @Pinned, @Status, @ScheduledPublishAt,
  @AutoArchive, @ExpiresOn, @UpdatedBy, @Found OUTPUT` — updates every non-deleted copy sharing the id
  (same field-set + PublishedAt/AutoArchiveAt recomputation as `usp_UpdateAnnouncement`, but WHERE
  `BroadcastId=@Bc`). `usp_RetireBroadcast @BroadcastId, @UpdatedBy, @Found OUTPUT` — soft-retires all
  copies (Status→'Retired' / your terminal, IsDeleted per existing retire semantics — mirror
  `usp_RetireAnnouncement` exactly, WHERE BroadcastId).

- [ ] **Step 1: tSQLt — update touches all copies; retire retires all copies.** Insert 2 copies sharing
  a `BroadcastId`, call update with a new title, assert both rows updated; call retire, assert both
  terminal. (Two-statement `AssertEquals` form as in 2.2.)
- [ ] **Step 2: Write both procs** by copying `usp_UpdateAnnouncement.sql` / `usp_RetireAnnouncement.sql`
  and swapping the `WHERE AnnouncementId = @Id` for `WHERE BroadcastId = @Bc AND IsDeleted = 0`, setting
  `@Found = CASE WHEN @@ROWCOUNT > 0 THEN 1 ELSE 0 END`.
- [ ] **Step 3: Run the class; expect PASS.**

### Task 2.5: `usp_ListPlatformWorkspaces` (target picker source)

**Files:**
- Create: `database/procedures/announcements/usp_ListPlatformWorkspaces.sql` (or `platform/` folder — match
  where platform reads live; use `platform/` if present, else this folder)
- Create: matching tSQLt test

**Interfaces:**
- Produces: `WorkspaceId, Name, Kind` for all `IsDeleted = 0` workspaces where `Kind <> 'pg-dept-template'`,
  ordered by `Name`. Bounded reference list — no pagination.

- [ ] **Step 1: tSQLt — excludes deleted + template, returns id/name/kind.**
- [ ] **Step 2: Write the proc** (single-table read; `SET NOCOUNT ON`, explicit columns, no `SELECT *`).
- [ ] **Step 3: Run; expect PASS.**

### Task 2.6: Shared DTO types

**Files:**
- Modify: `shared/types/announcements.ts` (add broadcast types)
- Modify: `shared/types/platform.ts` (add `PlatformWorkspaceDto`)
- Verify: `shared/types/index.ts` re-exports

**Interfaces (Produces — consumed by api DTOs and web api.ts):**

```ts
// announcements.ts
export type PlatformAnnouncementTargetKind = 'all' | 'specific';

export interface PlatformAnnouncementCreateRequest {
  title: string;
  body: string;
  pinned?: boolean;
  status?: AnnouncementWriteStatus;          // Active | Scheduled
  scheduledPublishAt?: IsoDateTime;
  autoArchive?: boolean;
  target: { kind: PlatformAnnouncementTargetKind; workspaceIds?: WorkspaceId[] };
}

export interface PlatformAnnouncementPatchRequest {
  title: string;
  body: string;
  pinned: boolean;
  status?: AnnouncementWriteStatus;
  scheduledPublishAt?: IsoDateTime;
  autoArchive?: boolean;
}

export interface PlatformAnnouncementRow {
  broadcastId: string;
  title: string;
  bodySnippet: string;
  pinned: boolean;
  status: AnnouncementStatus;
  author: UserId;
  authorName?: string;
  postedAt?: IsoDateTime;
  scheduledPublishAt?: IsoDateTime;
  autoArchive?: boolean;
  autoArchiveAt?: IsoDateTime;
  workspaceCount: number;
}
```
```ts
// platform.ts
export interface PlatformWorkspaceDto {
  id: WorkspaceId;
  name: string;
  kind: WorkspaceKind;
}
```

- [ ] **Step 1:** Add the types; `npx tsc --noEmit` clean in `web/` (shared types compile via web).

### Task 2.7: API — DTOs + `IAnnouncementsService` broadcast methods

**Files:**
- Modify: `api/Api/Modules/Announcements/AnnouncementDtos.cs` (C# mirrors of the shared types above +
  `PlatformAnnouncementRow` entity for `FromSqlRaw`)
- Modify: `api/Api/Modules/Announcements/AnnouncementsService.cs`
- Modify: `api/Api/Data/AppDbContext.cs` (register keyless result entity for the grouped read + workspaces read)
- Create: `api/Api.Tests/AnnouncementsBroadcastServiceTests.cs`

**Interfaces (Produces):**

```csharp
Task<int> CreatePlatformBroadcastAsync(
    PlatformAnnouncementCreateRequest request, IReadOnlyList<Guid> targetWorkspaceIds,
    Guid actorUserId, string operationId, CancellationToken ct);   // returns # copies created

Task<PaginatedResponse<PlatformAnnouncementRow>> QueryPlatformAsync(
    int page, int pageSize, CancellationToken ct);

Task<AnnouncementMutationResult> UpdateBroadcastAsync(
    Guid broadcastId, PlatformAnnouncementPatchRequest request, Guid actorUserId, string operationId, CancellationToken ct);

Task<AnnouncementMutationResult> RetireBroadcastAsync(
    Guid broadcastId, Guid actorUserId, CancellationToken ct);
```

- [ ] **Step 1: xUnit — fan-out creates one copy per target with a shared BroadcastId.** Mock the
  create path per workspace (or assert on `ExecuteSqlRaw` calls). Assert: N targets → N create calls,
  all with the **same** `@BroadcastId`; each Published copy triggers `EmitPublishedAsync` once.

- [ ] **Step 2: Implement `CreatePlatformBroadcastAsync`.** Generate `var broadcastId = Guid.NewGuid();`
  Loop `targetWorkspaceIds`, calling `usp_CreateAnnouncement` (audience `{"kind":"everyone"}`,
  `@AuthorUserId = actorUserId`, `@BroadcastId = broadcastId`, `@CreatedBy = actor`). For each newly
  Published copy, call the existing `EmitPublishedAsync(newId, workspaceId, actor, operationId, ct)`.
  Return the count. (Reuse the exact `usp_CreateAnnouncement` EXEC block from `CreateAsync`, adding the
  `@BroadcastId` parameter.)

- [ ] **Step 3: xUnit — grouped query maps rows.** Fake proc result → assert `PlatformAnnouncementRow`
  mapping incl. derived display status (reuse `DeriveDisplayStatus`) and `workspaceCount`.

- [ ] **Step 4: Implement `QueryPlatformAsync`** via `FromSqlRaw("EXEC dbo.usp_QueryPlatformAnnouncements @Page, @PageSize", …)`
  into a keyless `PlatformAnnouncementRowEntity`, then `BuildPlatformListResponse` (mirror
  `BuildListResponse`, deriving display status + carrying `workspaceCount`).

- [ ] **Step 5: xUnit — update/retire broadcast.** Assert the `usp_UpdateBroadcast` / `usp_RetireBroadcast`
  EXECs run with `@BroadcastId`; not-found `@Found=0` → `InvalidState`.

- [ ] **Step 6: Implement `UpdateBroadcastAsync` / `RetireBroadcastAsync`** (EXEC the new procs; map
  `@Found` → Success/InvalidState; no per-row author validation — platform author is the actor).

- [ ] **Step 7:** `dotnet build` + `dotnet test` for the new class; expect PASS.

### Task 2.8: API — `PlatformAnnouncementsController` + workspaces read

**Files:**
- Create: `api/Api/Modules/Announcements/PlatformAnnouncementsController.cs`
- Modify (or create): a platform workspaces read — add `GET /v1/platform/workspaces` to a new
  `PlatformWorkspacesController` or extend an existing platform controller; back it with
  `usp_ListPlatformWorkspaces` + `IWorkspaceDirectoryService` (single-table EF read is also acceptable
  per `api-data-access.md` — prefer the proc for consistency with the manage reads).
- Modify: `api/Api/Program.cs` (DI for any new service)
- Create: `api/Api.Tests/PlatformAnnouncementsControllerTests.cs`

**Interfaces (routes, all `IsPlatformAdmin`-gated; 403 non-admin):**
- `GET  /api/v1/platform/workspaces` → `PlatformWorkspaceDto[]`
- `POST /api/v1/platform/announcements` → 201 `{ broadcastId, workspaceCount }` (validate title/body,
  target: `all` OR `specific` w/ ≥1 id; resolve `all` → every non-deleted non-template workspace;
  reject unknown/deleted workspace ids → 400)
- `POST /api/v1/platform/announcements/query` → `PaginatedResponse<PlatformAnnouncementRow>`
- `PATCH /api/v1/platform/announcements/{broadcastId:guid}` → 200 (validate write status like the
  workspace controller's `ValidateWriteStatus`) / 409 on terminal
- `POST /api/v1/platform/announcements/{broadcastId:guid}/retire` → 200

- [ ] **Step 1: xUnit controller tests.** For each route: platform-admin happy path + non-admin → 403.
  Create: `target.kind='specific'` with empty ids → 400; `target.kind='all'` → fan-out count returned.
  Reuse the `IsPlatformAdminAsync` mock pattern from `AccessControllerTests`.

- [ ] **Step 2: Implement the controller.** Gate every action with
  `if (!await _accessGuard.IsPlatformAdminAsync(_currentUser.UserId, ct)) return AccessDenied();`
  Validation mirrors `AnnouncementsController.ValidateWriteStatus`. Resolve targets: `all` → call the
  workspaces read; `specific` → verify each id is a known non-deleted non-template workspace (single
  query) else 400. Map service `AnnouncementMutationResult` → status codes with the existing helpers
  (copy `MapMutation`/`AccessDenied`/`ConflictProblem` or extract shared helpers).

- [ ] **Step 3: Implement the workspaces read endpoint + service** (proc-backed; `AsNoTracking`-style
  keyless entity for `FromSqlRaw`).

- [ ] **Step 4:** `dotnet test`; expect PASS. Add an integration test: create-all → query (one grouped
  row, count = seeded workspace count) → patch → retire.

### Task 2.9: Web — platform announcements API + hooks

**Files:**
- Create: `web/src/features/announcements/platformApi.ts`
- Create: `web/src/features/announcements/usePlatformAnnouncements.ts`
- Modify: `web/src/features/platform-admin/api.ts` (add `fetchPlatformWorkspaces`) or a small
  `web/src/features/announcements/platformApi.ts` housing all four calls + the workspaces read
- Create: colocated `.test.ts` files

**Interfaces (Produces):**

```ts
export function fetchPlatformWorkspaces(signal?: AbortSignal): Promise<PlatformWorkspaceDto[]>;
export function createPlatformBroadcast(body: PlatformAnnouncementCreateRequest): Promise<{ broadcastId: string; workspaceCount: number }>;
export function queryPlatformAnnouncements(query: { page: number; pageSize: number }): Promise<PaginatedResponse<PlatformAnnouncementRow>>;
export function updatePlatformBroadcast(broadcastId: string, body: PlatformAnnouncementPatchRequest): Promise<void>;
export function retirePlatformBroadcast(broadcastId: string): Promise<void>;
// hooks: usePlatformWorkspaces(), usePlatformAnnouncements(page), useCreatePlatformBroadcast(), useUpdatePlatformBroadcast(), useRetirePlatformBroadcast()
```

- [ ] **Step 1:** Tests for each `apiFetch` wrapper (URL, method, body) mirroring `api.test.ts`.
- [ ] **Step 2:** Implement the thin `apiFetch` wrappers + TanStack Query hooks (mirror
  `useAnnouncements.ts` + `useAccessGrants.ts`); invalidate the platform list query on mutate.
- [ ] **Step 3:** `npx tsc --noEmit` clean; wrapper tests PASS.

### Task 2.10: Web — `PlatformBroadcastEditor` (editor + target picker)

**Files:**
- Create: `web/src/features/announcements/components/PlatformBroadcastEditor.tsx`
- Create: `web/src/features/announcements/components/PlatformBroadcastEditor.test.tsx`

**Interfaces:**
- Consumes: `PlatformWorkspaceDto[]` (target options), `PlatformAnnouncementCreateRequest`.
- Produces: modal editor. Fields = the workspace `AnnouncementEditor` **minus "Posted by"**, **plus** a
  target section: a radio/segmented `All workspaces` vs `Specific workspaces`, revealing a checkbox list
  of workspaces when `specific`. In **edit** mode the target section is read-only (targets fixed at create).

- [ ] **Step 1: Tests** — validation (title/body required; specific with zero selected → error; scheduled
  requires future datetime — reuse the editor's rules); target `all` vs `specific` toggle reveals/hides
  the workspace list; edit mode hides/read-onlys the target section. jest-axe on: create-all,
  create-specific (list open), validation-error, edit state.
- [ ] **Step 2: Implement** by adapting `AnnouncementEditor.tsx` (copy the Title/Body/Status/DateTimeField/
  auto-archive/pin block verbatim; drop the `Select "Posted by"`; add the target section as a
  `data-ds`-tagged fieldset). Emit a `PlatformEditorValue` including `target`.
- [ ] **Step 3:** `npx tsc --noEmit` clean; tests PASS.

### Task 2.11: Web — `PlatformAnnouncementsPage` (grouped table + wiring)

**Files:**
- Create: `web/src/features/announcements/components/PlatformAnnouncementsPage.tsx`
- Create: `web/src/features/announcements/components/PlatformAnnouncementsPage.test.tsx`
- Modify: `web/src/features/announcements/index.ts` (export the page)
- Modify: `web/src/features/platform-admin/platformNav.ts` (add nav entry)
- Modify: `web/src/App.tsx` (add `<Route path="announcements" element={<PlatformAnnouncementsPage />} />`
  under `/platform`)

**Interfaces:**
- Consumes: the hooks from 2.9, the editor from 2.10.
- Produces: `/platform/announcements` surface. Grouped table columns: ANNOUNCEMENT · POSTED BY · POSTED ·
  WORKSPACES (the `workspaceCount` summary — "All" when count = total workspaces, else "N workspaces") ·
  STATUS, with row-open → edit and a retire action. Explicit loading/error/empty states; client-side
  paginate via `TableFooter`.

- [ ] **Step 1: Add the nav entry** to `PLATFORM_NAV`:
```ts
{ to: '/platform/announcements', label: 'Announcements',
  lead: 'Post a notice to every workspace or specific ones. Each targeted workspace receives it in its members’ bell.' },
```
- [ ] **Step 2: Page tests** — loading, error, empty ("No broadcasts yet"), list (one grouped row shows
  "3 workspaces"), New → editor create-all → success invalidates list, row-open → edit, retire flow.
  jest-axe on each state.
- [ ] **Step 3: Implement the page** (mirror `ManageAnnouncementsPage` structure; grouped rows come
  pre-aggregated from the API so no client grouping). Route + index export.
- [ ] **Step 4:** `npx tsc --noEmit` clean; `npx jest announcements` green.

### Task 2.12: E2E + gates + ship

- [ ] **Step 1:** Playwright `web/e2e/platform-announcements.spec.ts` — as a platform admin: post to all
  workspaces → the broadcast appears as one grouped row with the workspace count → retire it → it leaves
  the active list. Reset localStorage per `web-testing.md`.
- [ ] **Step 2:** `/dev-review-and-remediate` until CLEAN (runs lint, jest coverage, playwright, dotnet,
  tSQLt, code + security review).
- [ ] **Step 3:** `/dev-ship`.

---

## Self-Review

- **Spec coverage:** Part A → Task 1.1–1.2. Part B storage/`BroadcastId` → 2.1–2.2; grouped read →
  2.3/2.7; broadcast edit/retire → 2.4/2.7/2.8; workspaces read → 2.5/2.8; fan-out create → 2.7/2.8;
  editor (no author, + target) → 2.10; surface/nav/route → 2.11; audience `everyone` + author=actor +
  fixed targets → enforced in 2.7/2.8/2.10. Testing section → per-task test steps + 1.2/2.12 E2E. ✓
- **Type consistency:** `PlatformAnnouncementRow` (2.6) is the return of `QueryPlatformAsync` (2.7),
  the query route (2.8), and the page/table (2.11). `PlatformAnnouncementCreateRequest.target` shape is
  identical in 2.6/2.8/2.10. `usp_CreateAnnouncement` trailing `@BroadcastId` (2.2) matches the fan-out
  call (2.7). `broadcastId` param name consistent across 2.4/2.7/2.8/2.9. ✓
- **Placeholders:** none — the one `AssertEmptyTable ...` line in the 2.3 test sketch is explicitly
  replaced by the row-count assertion beneath it. ✓
