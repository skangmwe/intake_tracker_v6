# Custom-object Records — Storage & Schema Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project workflow note:** this repo blocks direct `git commit` (a PreToolUse hook) — commits happen only through `/dev-ship`, and each slice is gated by `/dev-review-and-remediate` first. So the "Commit" step at the end of each **slice** below = run `/dev-review-and-remediate` (tSQLt + xUnit + code/security review, CLEAN) then `/dev-ship`. Within a slice, tasks are authored and tested but not individually committed. Read the governing rule files before writing code (see Global Constraints).

**Goal:** Give admin-created custom objects a real field schema and a record store with full CRUD via the API, so later sub-projects can add UI and CSV import/export.

**Architecture:** One generic `dbo.CustomRecords` table (a `FieldValues` JSON map discriminated by `ObjectDefinitionId`) reuses the exact Request/Feature storage pattern. Custom-object fields reuse the existing `FieldDefinition`/`FieldSchemaService` pipeline, keyed by an immutable per-object slug (`ObjectDefinition.ObjectKey`) placed in the (widened) `FieldDefinition.ObjectType` column. A generic `CustomRecordsService` + controller provide CRUD, workspace-membership-gated, mirroring `RequestsService`.

**Tech Stack:** ASP.NET Core (net10.0), EF Core (single-table + `FromSqlRaw` keyless projections), Azure SQL stored procedures, xUnit + Moq, tSQLt.

**Spec:** `docs/superpowers/specs/2026-07-24-custom-object-records-foundation-design.md`

## Global Constraints

- **Read before coding** (per `.claude/rules/dev/_core-requirements.md`): `database-coding-standards.md`, `database-migrations.md`, `database-stored-procedures.md`, `database-testing.md` (DB tasks); `api-coding-standards.md`, `api-validation.md`, `api-error-handling.md`, `api-record-access.md`, `api-testing-guidelines.md` (API tasks). State which rules were read at slice start.
- **Every table:** PK + six audit columns (`CreatedAt/UpdatedAt/CreatedBy/UpdatedBy/IsDeleted/DeletedAt`) + soft-delete; every FK has a non-clustered index; `DATETIME2`, `NVARCHAR` for user text.
- **Every migration:** idempotent (`IF NOT EXISTS` guards) + a matching `_Rollback.sql`; one logical change per file; `YYYYMMDD_NNN_Description.sql` naming; next number is **077**.
- **Every proc:** `SET NOCOUNT ON; SET XACT_ABORT ON;`; writes wrapped in `TRY…CATCH` + explicit `BEGIN TRAN`/`COMMIT`/`ROLLBACK`; `CREATE OR ALTER`; schema-qualified; explicit columns (no `SELECT *`); parameters copied to locals; soft-deleted rows excluded.
- **Every async method** accepts and passes `CancellationToken`; `ConfigureAwait(false)` in services; `FromSqlRaw` + `SqlParameter` only (never string-concatenated SQL).
- **Controllers** do request/response only; ownership/scope violations return **`403`/`404`, never disclose existence**; all errors are ProblemDetails; pagination `{page,pageSize,filters}`, default 20, max 100.
- **No logging** of record content / field values / names (Confidential — `api-pii-handling.md`).
- **Tests ship in the slice** (tSQLt for every proc; xUnit for every service; ≥1 integration test for the CRUD cycle). Slice is done only when `/dev-review-and-remediate` reports CLEAN.

---

# Slice 1a — Storage & schema

Deliverable: custom objects get a slug, a records table exists, `FieldDefinition` accepts custom object types, and the Fields tab + Objects tab reflect custom objects (system fields synthesized, live counts). No records API yet.

### Task 1: `ObjectDefinition.ObjectKey` slug column + migration

**Files:**
- Create: `database/migrations/20260724_077_AddObjectKeyToObjectDefinition.sql`
- Create: `database/migrations/20260724_077_AddObjectKeyToObjectDefinition_Rollback.sql`
- Modify: `api/Api/Data/Entities.cs` (add `ObjectKey` to `ObjectDefinitionRow`)

**Interfaces:**
- Produces: `dbo.ObjectDefinition.ObjectKey NVARCHAR(64) NOT NULL`; unique filtered index `UX_ObjectDefinition_Workspace_ObjectKey ON (WorkspaceId, ObjectKey) WHERE IsDeleted = 0`. `ObjectDefinitionRow.ObjectKey` string property.

- [ ] **Step 1: Write the migration (idempotent).** Add the column NULLable first, backfill a slug from `Name` for existing rows (lowercase, non-alphanumeric → `-`, collapse repeats, trim; append `-` + left-8 of `ObjectDefinitionId` on collision), then `ALTER COLUMN … NOT NULL`, then create the unique filtered index. Guard each with `IF NOT EXISTS`/`IF COL_LENGTH(...) IS NULL`. Write the `MigrationHistory` insert.
- [ ] **Step 2: Write the rollback.** Drop the index (if exists), drop the column (if exists), delete the `MigrationHistory` row. Idempotent.
- [ ] **Step 3: Apply + verify on LocalDB.** Run the `.local-testing/sqlrunner` (or apply the file) against `AiSolutionsTrackerDev`; verify the column + index exist and (if any custom objects exist) each has a non-null unique `ObjectKey`. The seeded dev DB has no custom objects, so this is a no-op-safe apply.
- [ ] **Step 4: Add `ObjectKey` to `ObjectDefinitionRow`** in `Entities.cs` (`public string ObjectKey { get; set; } = string.Empty;`). Build the API project — expect success.

### Task 2: Generate the slug on object create + expose it

**Files:**
- Modify: `database/procedures/objects/usp_UpsertObjectDefinition.sql` (compute + persist `ObjectKey` on insert; leave it unchanged on update)
- Modify: `api/Api/Modules/Objects/ObjectSchemaService.cs` (map `ObjectKey` through `MapCustom`)
- Modify: `api/Api/Modules/Objects/ObjectDtos.cs` (add `ObjectKey` to `ObjectDefinitionDto`; built-ins use their existing type key as `ObjectKey`)
- Test: `database/tests/objects/test_usp_UpsertObjectDefinition.sql` (extend), `api/Api.Tests/ObjectSchemaServiceTests.cs` (extend)

**Interfaces:**
- Consumes: `dbo.ObjectDefinition.ObjectKey` (Task 1).
- Produces: `ObjectDefinitionDto.ObjectKey` (string); `usp_UpsertObjectDefinition` sets `ObjectKey` on insert via the same slug rule as the Task-1 backfill (a `dbo.fn_Slugify`-style inline expression or a small scalar helper — inline the expression to avoid a new function).

- [ ] **Step 1: Write the failing tSQLt test.** `test_Insert_SetsUniqueObjectKeyFromName`: FakeTable `dbo.ObjectDefinition`; call the proc to insert an object named `Vendor`; assert the inserted row's `ObjectKey = 'vendor'`. `test_Insert_DisambiguatesOnCollision`: pre-insert a row with `ObjectKey='vendor'`; insert another `Vendor`; assert the new `ObjectKey` starts with `vendor-` and differs.
- [ ] **Step 2: Run — expect FAIL** (proc doesn't set `ObjectKey` yet). *(tSQLt runs via `/dev-review-and-remediate`/CI; locally, confirm by reading the proc — it doesn't reference `ObjectKey`.)*
- [ ] **Step 3: Implement.** In the proc's INSERT branch, compute the slug from `@Name` inline and pick a unique value (`WHILE EXISTS` against `(WorkspaceId, ObjectKey) WHERE IsDeleted=0` appending a short suffix). Persist to the new column. The UPDATE branch does not touch `ObjectKey` (immutable). Add `ObjectKey` to the proc's output/select.
- [ ] **Step 4: Extend `MapCustom`** to carry `row.ObjectKey`; add `ObjectKey` to `ObjectDefinitionDto`; in `BuildSystemObjects`, set each built-in's `ObjectKey` to its type key (`"Request"`, `"Task"`, …). Update `ObjectSchemaServiceTests` (`BuildSystemObjects` assertion) to expect the `ObjectKey`.
- [ ] **Step 5: Build + run xUnit** for `ObjectSchemaServiceTests` — expect PASS.

### Task 3: Widen `FieldDefinition.ObjectType` + drop the type CHECK

**Files:**
- Create: `database/migrations/20260724_078_AllowCustomObjectFields.sql`
- Create: `database/migrations/20260724_078_AllowCustomObjectFields_Rollback.sql`

**Interfaces:**
- Produces: `FieldDefinition.ObjectType` widened `NVARCHAR(16)` → `NVARCHAR(64)`; `CK_FieldDefinition_ObjectType` dropped. (The unique key `UX_FieldDefinition_*` on `(WorkspaceId, ObjectType, FieldKey)` is preserved — dropping/recreating only if the widen requires it.)

- [ ] **Step 1: Write the migration.** `IF` the column is 16 wide: drop any index that includes `ObjectType`, `ALTER COLUMN ObjectType NVARCHAR(64) NOT NULL`, recreate the index. `IF EXISTS` the CHECK constraint → drop it. `MigrationHistory` insert. Idempotent.
- [ ] **Step 2: Write the rollback.** Recreate `CK_FieldDefinition_ObjectType` with the current allowed set (`Request/Task/Feature/ToolkitItem/Attachment`) — **only if** no custom-object field rows exist (guard: `IF NOT EXISTS (SELECT 1 FROM FieldDefinition WHERE ObjectType NOT IN (…))`), else leave the CHECK off and note it; narrow the column back to 16 only when safe. Delete the `MigrationHistory` row.
- [ ] **Step 3: Apply + verify on LocalDB.** Confirm the column is `nvarchar(64)` and the CHECK is gone (`SELECT … FROM sys.check_constraints`). Insert a probe `FieldDefinition` row with `ObjectType='vendor'` in a transaction, confirm it's accepted, roll back the probe.

### Task 4: Synthesize system fields for custom objects (Fields tab)

**Files:**
- Modify: `api/Api/Modules/Fields/FieldSchemaService.Catalog.cs` (`GetCatalogAsync` + `BuildCatalogRows`)
- Modify: `api/Api/Modules/Fields/FieldSchemaService.cs` (constructor/deps if needed to read custom objects)
- Test: `api/Api.Tests/FieldCatalogBuilderTests.cs` (extend)

**Interfaces:**
- Consumes: the workspace's custom objects (`ObjectDefinitionId`, `ObjectKey`, `Name`) — read via the existing `usp_ListObjectDefinitions` (already used by `ObjectSchemaService`).
- Produces: `BuildCatalogRows(stored, builtIn, customObjects)` overload — `customObjects` is `IReadOnlyList<(string ObjectType, string Label)>` (the slug as `ObjectType`, the object's `Name` as label). Existing 1-arg/2-arg overloads preserved (delegate with an empty custom list) so existing tests are untouched.

- [ ] **Step 1: Write the failing xUnit test.** `BuildCatalogRows_CustomObject_SynthesizesFiveSystemFields`: pass one custom object `("vendor","Vendor")`, no stored rows; assert the result contains five rows for `ObjectType="vendor"` with keys `recordId/name/createdAt/updatedAt/createdBy`, `Source="System"`, `IsReadOnly=true`, `ObjectLabel="Vendor"`.
- [ ] **Step 2: Run — expect FAIL** (`BuildCatalogRows` has no custom-object handling).
- [ ] **Step 3: Implement.** Add the 3-arg `BuildCatalogRows` overload: after the hardcoded `CatalogObjects` loop, loop `customObjects` and emit the same five `SystemAutoFields` rows per object (id `system:{slug}:{key}`, `Location="Global"`? → use `"LocalWorkspace"` for custom; label = the object's `Name`). Stored custom-field rows (Task 3 allows them) already flow through the existing "stored" loop via `usp_GetWorkspaceFieldCatalog` (they carry `ObjectType=<slug>`), and `LabelForObject` falls back to the raw key — extend `LabelForObject` to accept a slug→Name map so the OBJECT column shows `Vendor` not `vendor`. `GetCatalogAsync` reads the workspace's custom objects and passes them + the map.
- [ ] **Step 4: Run xUnit** `FieldCatalogBuilderTests` — expect PASS (new + existing).

### Task 5: Live record/field counts on the Objects tab

**Files:**
- Create: `database/procedures/objects/usp_GetCustomObjectCounts.sql` (per-object record + field counts for a workspace)
- Modify: `api/Api/Modules/Objects/ObjectSchemaService.cs` (`MapCustom` uses live counts)
- Modify: `api/Api/Data/Entities.cs` (`CustomObjectCountsRow` keyless projection) + `AppDbContext.cs` (register)
- Test: `database/tests/objects/test_usp_GetCustomObjectCounts.sql`, `api/Api.Tests/ObjectSchemaServiceTests.cs`

**Interfaces:**
- Consumes: `dbo.CustomRecords` (created in Slice 1b — **so this task's record-count path lands in 1b**; in 1a implement the **field** count only and leave records at 0, then flip records to live in 1b). *(Decision: to keep 1a shippable without the records table, Task 5 in 1a computes `FieldsCount` live from `FieldDefinition` per slug and keeps `RecordsCount: 0`; 1b adds the record count.)*
- Produces: `usp_GetCustomObjectCounts @WorkspaceId` → rows `(ObjectDefinitionId, FieldsCount)` (records added in 1b).

- [ ] **Step 1: Write the failing tSQLt test** for `FieldsCount` (FakeTable `FieldDefinition` with 3 rows for a slug → assert count 3 for that object).
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the proc (join `ObjectDefinition` → `FieldDefinition` on `ObjectType = ObjectKey`, group). Wire `ObjectSchemaService.ListAsync` to read it and set `FieldsCount` on `MapCustom` (keep `RecordsCount: 0` with a `// 1b` note).
- [ ] **Step 4: xUnit** `ObjectSchemaServiceTests` — a custom object with fields reports the live `FieldsCount`.

### Slice 1a — gate + ship
- [ ] Run `/dev-review-and-remediate` → CLEAN (tSQLt for the two procs, xUnit for FieldSchemaService/ObjectSchemaService, migrations idempotent + rollbacks). Apply the migrations to LocalDB and smoke-verify.
- [ ] Run `/dev-ship`.

---

# Slice 1b — Record CRUD API

Deliverable: create / query / detail / update / soft-delete records of a custom object through the API, workspace-gated and schema-validated (light). The Objects tab shows live record counts.

### Task 6: `dbo.CustomRecords` table + migration

**Files:**
- Create: `database/migrations/20260724_079_CreateCustomRecords.sql` + `_Rollback.sql`
- Modify: `api/Api/Data/Entities.cs` (`CustomRecordRow` tracked entity + keyless `CustomRecordExportRow` is **not** needed here — SP5) ; `AppDbContext.cs` (register `CustomRecordRow` as a normal entity/table)

**Interfaces:**
- Produces: table per the spec (`RecordId` PK GUID, `ObjectDefinitionId`/`WorkspaceId` FKs, `Name`, `FieldValues` JSON+ISJSON check, six audit cols); indexes NC(`ObjectDefinitionId`), NC(`WorkspaceId`), composite `(WorkspaceId, ObjectDefinitionId, RecordId) WHERE IsDeleted=0`. `CustomRecordRow` entity mapping those columns.

- [ ] **Step 1: Write the migration** (idempotent `IF OBJECT_ID(...) IS NULL CREATE TABLE …`) with the FKs, the `ISJSON` check, and the three indexes (`IF NOT EXISTS`). `MigrationHistory` insert.
- [ ] **Step 2: Write the rollback** (`DROP TABLE IF EXISTS dbo.CustomRecords`; delete `MigrationHistory` row).
- [ ] **Step 3: Apply + verify on LocalDB** (table + indexes exist; a probe insert with valid/invalid JSON confirms the `ISJSON` check).
- [ ] **Step 4: Add `CustomRecordRow`** to `Entities.cs` and register it in `AppDbContext.OnModelCreating` (normal keyed entity → `dbo.CustomRecords`). Build — expect success.

### Task 7: Read procs — `usp_GetCustomRecordById`, `usp_QueryCustomRecords`

**Files:**
- Create: `database/procedures/customrecords/usp_GetCustomRecordById.sql`, `usp_QueryCustomRecords.sql`
- Modify: `usp_GetCustomObjectCounts.sql` (add live `RecordsCount`)
- Test: `database/tests/customrecords/test_usp_GetCustomRecordById.sql`, `test_usp_QueryCustomRecords.sql`

**Interfaces:**
- Produces:
  - `usp_GetCustomRecordById @RecordId, @WorkspaceId, @ObjectDefinitionId` → 0/1 row (`RecordId, Name, FieldValues, CreatedAt/By, UpdatedAt/By, RowVer?`); returns nothing when soft-deleted or scope mismatch.
  - `usp_QueryCustomRecords @WorkspaceId, @ObjectDefinitionId, @Page, @PageSize` → page rows (`RecordId, Name, FieldValues`) + a separate total-count result set (mirror `usp_QueryRequests` two-result-set shape) **or** a single paginated `OFFSET/FETCH` set + a scalar count — pick the `OFFSET/FETCH` + count column pattern used by `usp_GetTasksForWorkspace` for simplicity.

- [ ] **Step 1: Write failing tSQLt** for both: by-id returns the row for the matching scope and nothing for a foreign workspace/object/soft-deleted; query paginates and excludes soft-deleted + foreign scope. (FakeTable `dbo.CustomRecords`.)
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** both procs (boilerplate; explicit columns; `WHERE WorkspaceId=@Ws AND ObjectDefinitionId=@Obj AND IsDeleted=0`; `OFFSET/FETCH`). Add `RecordsCount` to `usp_GetCustomObjectCounts`.
- [ ] **Step 4: (verify via the gate).**

### Task 8: Write procs — create / patch / delete

**Files:**
- Create: `database/procedures/customrecords/usp_CreateCustomRecord.sql`, `usp_PatchCustomRecord.sql`, `usp_DeleteCustomRecord.sql`
- Test: `database/tests/customrecords/test_usp_CreateCustomRecord.sql`, `…_PatchCustomRecord.sql`, `…_DeleteCustomRecord.sql`

**Interfaces:**
- Produces:
  - `usp_CreateCustomRecord @WorkspaceId, @ObjectDefinitionId, @Name, @FieldValuesJson, @ActorUserId, @RecordId OUTPUT` — inserts (validates `@ObjectDefinitionId` exists + not deleted in `@WorkspaceId`; `THROW 50083` if not). Sets audit cols.
  - `usp_PatchCustomRecord @RecordId, @WorkspaceId, @ObjectDefinitionId, @Name, @FieldValuesJson, @ActorUserId` — updates the row in scope; `THROW 50043` (not-found) when 0 rows match. Merges/replaces `FieldValues` (replace whole map — the API sends the full map).
  - `usp_DeleteCustomRecord @RecordId, @WorkspaceId, @ObjectDefinitionId, @ActorUserId` — soft delete; `THROW 50043` when 0 rows match.

- [ ] **Step 1: Write failing tSQLt** — create inserts + returns id; create with a non-existent object throws `50083`; patch updates name+values; patch of a foreign-scope/deleted row throws `50043`; delete sets `IsDeleted=1` and is idempotent-safe (second delete → 0 rows → `50043`).
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the three procs (`TRY…CATCH`, `BEGIN TRAN`, `THROW`, audit cols, soft-delete filter).
- [ ] **Step 4: (verify via the gate).**

### Task 9: `CustomRecordsService` (create/query/detail/patch/delete)

**Files:**
- Create: `api/Api/Modules/CustomRecords/CustomRecordsService.cs`, `CustomRecordDtos.cs`
- Modify: `api/Api/Data/Entities.cs` (keyless read projections `CustomRecordRow`? — reuse the tracked entity for by-id via `FromSqlRaw`, or a keyless `CustomRecordReadRow` for the query/detail projections), `AppDbContext.cs`
- Modify: `api/Api/Program.cs` (register `ICustomRecordsService`)
- Test: `api/Api.Tests/CustomRecordsServiceTests.cs`

**Interfaces:**
- Consumes: the five procs (Tasks 7–8); `IAccessGuard.HasWorkspaceLevelAsync`; the object-existence check (query `ObjectDefinition`).
- Produces:
  ```csharp
  public interface ICustomRecordsService {
    Task<CustomRecordDto?> GetByIdAsync(Guid workspaceId, Guid objectId, Guid recordId, Guid userId, CancellationToken ct);
    Task<PaginatedResponse<CustomRecordListRow>?> QueryAsync(Guid workspaceId, Guid objectId, PaginatedQuery query, Guid userId, CancellationToken ct);
    Task<CustomRecordWriteResult> CreateAsync(Guid workspaceId, Guid objectId, CustomRecordWriteRequest req, Guid userId, string operationId, CancellationToken ct);
    Task<CustomRecordWriteResult> PatchAsync(Guid workspaceId, Guid objectId, Guid recordId, CustomRecordWriteRequest req, Guid userId, string operationId, CancellationToken ct);
    Task<CustomRecordWriteOutcome> DeleteAsync(Guid workspaceId, Guid objectId, Guid recordId, Guid userId, string operationId, CancellationToken ct);
  }
  public enum CustomRecordWriteOutcome { Success, NotFound, Denied, ValidationFailed }
  public sealed record CustomRecordWriteResult(CustomRecordWriteOutcome Outcome, CustomRecordDto? Record = null, IReadOnlyDictionary<string,string[]>? Errors = null);
  public sealed record CustomRecordWriteRequest(string Name, IReadOnlyDictionary<string, JsonElement> Fields);
  public sealed record CustomRecordDto(Guid Id, Guid ObjectDefinitionId, string Name, IReadOnlyDictionary<string, JsonElement> Fields, DateTime CreatedAt, DateTime UpdatedAt, string ETag);
  public sealed record CustomRecordListRow(Guid Id, string Name, IReadOnlyDictionary<string, object?> Columns);
  ```
- Access: reads gate `Viewer`, writes gate `Member` (mirror `RequestsService`). Object-not-found (or foreign scope) → `Denied`/`NotFound` mapped to `403`/`404` per `api-record-access.md`.
- Validation (light): before create/patch, read the object's `FieldDefinition` rows (via `FieldSchemaService.ReadFieldsAsync(ws, slug)` — resolve slug from the object) and require every `IsRequired` field key to be present + non-empty in `Fields` → else `ValidationFailed` with per-field errors. Unknown keys are kept as-is (dropped only if we later add strictness).

- [ ] **Step 1: Write failing xUnit** (`IAccessGuard`, procs mocked via a thin repo boundary or an in-memory context à la `RequestIoObjectTests`): create happy path returns `Success` + id; non-member create → `Denied`; missing required field → `ValidationFailed`; get/patch/delete of a foreign-scope record → `NotFound`; cancellation propagates.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the service (mirror `RequestsService` structure — gate, proc call via `FromSqlRaw`/`ExecuteSqlRawAsync` + `SqlParameter`, map rows, ETag from `RowVer`). Register in `Program.cs`.
- [ ] **Step 4: Run xUnit** — expect PASS.

### Task 10: `CustomRecordsController`

**Files:**
- Create: `api/Api/Modules/CustomRecords/CustomRecordsController.cs`
- Test: `api/Api.Tests/CustomRecordsControllerTests.cs`

**Interfaces:**
- Consumes: `ICustomRecordsService`, `ICurrentUser`.
- Produces routes (mirror `RequestsController` attributes: `[ApiController]`, `[Route("api/v1")]`, `OperationId()`):
  - `POST   workspaces/{workspaceId:guid}/objects/{objectId:guid}/records` → 201 + dto / 400 ValidationProblem / 403 / 404
  - `POST   workspaces/{workspaceId:guid}/objects/{objectId:guid}/records/query` → 200 page (POST-body query, per api/CLAUDE.md "prefer POST with JSON body")
  - `GET    workspaces/{workspaceId:guid}/objects/{objectId:guid}/records/{recordId:guid}` → 200 / 403 / 404
  - `PATCH  workspaces/{workspaceId:guid}/objects/{objectId:guid}/records/{recordId:guid}` → 200 / 400 / 403 / 404 (If-Match honored if present)
  - `DELETE workspaces/{workspaceId:guid}/objects/{objectId:guid}/records/{recordId:guid}` → 204 / 403 / 404

- [ ] **Step 1: Write failing xUnit** (`ICustomRecordsService` mocked): each action maps each outcome to the right status (Success→201/200/204; Denied→403; NotFound→404; ValidationFailed→400 `ValidationProblem`).
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the controller (thin; map outcomes; `ct` passed).
- [ ] **Step 4: Run xUnit** — expect PASS.

### Task 11: Integration test — full CRUD cycle

**Files:**
- Test: `api/Api.Tests/CustomRecordsIntegrationTests.cs` (WebApplicationFactory + real LocalDB, per `api-testing-guidelines.md`)

- [ ] **Step 1: Write the test:** seed a custom object (+ one required field via `FieldDefinition`); POST a record (201, id) → GET it (values match) → PATCH (name + a field change) → GET (reflects change) → query (returns 1) → DELETE (204) → GET (404) → query (0). Auth via the dev-bypass test user.
- [ ] **Step 2: Run — expect PASS** (all pieces exist by now).

### Slice 1b — gate + ship
- [ ] `/dev-review-and-remediate` → CLEAN (tSQLt for 5 procs, xUnit for service + controller, integration test, migrations idempotent + rollbacks). Apply migrations + procs to LocalDB; smoke-run the CRUD cycle over HTTP against the running dev stack; confirm the Objects tab now shows a live record count.
- [ ] `/dev-ship`.

---

## Self-review (author checklist, done)

- **Spec coverage:** slug (T1–T2), CustomRecords table (T6), FieldDefinition widen + CHECK drop (T3), system-field synthesis (T4), live counts (T5, T7), 5 procs (T7–T8), service + controller CRUD (T9–T10), light required-field validation (T9), access 403/404 (T9–T10), tests incl. integration (all tasks + T11). Out-of-scope items (UI, import/export, rich validation) are not tasked — correct.
- **Placeholders:** none — every task names exact files, interfaces, and test cases; boilerplate references a named existing pattern (`usp_GetTasksForWorkspace`, `RequestsService`, `RequestsController`) per "follow established patterns in existing codebases."
- **Type consistency:** `CustomRecordWriteRequest`/`CustomRecordDto`/`CustomRecordWriteOutcome`/`ICustomRecordsService` names are used identically in Tasks 9–11; slug key (`ObjectKey`) is the `FieldDefinition.ObjectType` value throughout (T2–T4, T9 validation).
- **Open questions (from the spec):** slug backfill handled in T1 Step 1; Global custom objects deferred (records workspace-scoped) — no task, matches the spec default.
