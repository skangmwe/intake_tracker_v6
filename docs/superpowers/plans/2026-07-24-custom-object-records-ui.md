# Custom-object records — CRUD UI, rich list & detail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give any custom object a full in-app records experience — a paginated list with server-side filters, sortable columns, and per-object saved views; a create form; a full-page detail with inline-editable fields; and delete — consuming the SP1 (slice 1b) records API.

**Architecture:** Backend adds three things to SP1's foundation: it exposes a custom object's field schema through the existing `GET /fields` endpoint, generalizes the already-generic saved-views subsystem to accept custom-object slugs (mirroring SP1's `CK_FieldDefinition_ObjectType` drop), and replaces the stub `usp_QueryCustomRecords` with a real filter/sort query that operates over the `FieldValues` JSON bag via `sp_executesql` with schema-whitelisted field keys and fully parameterized values. The frontend adds a `features/custom-records` vertical slice that clones the Requests list/create/detail surfaces and reuses every shared component (`TableShell`, `FilterFunnel`, `ViewBar`, `SavedViewPicker`, `SavedViewEditor`, the shared Form controls), plus a shared `FieldControl` extracted from Requests so both surfaces drive off one dynamic-field renderer.

**Tech Stack:** SQL Server (Azure SQL / LocalDB), tSQLt; ASP.NET Core + EF Core (raw ADO.NET for the two-result-set query), xUnit + Moq; React 19 + TypeScript 5 + TanStack Query, SCSS Modules, Jest + jest-axe + Playwright.

## Global Constraints

- **Reviewable ceiling:** 5000–8000 LoC per slice; three slices (A backend, B browse, C mutate). B and C are independently rollable; A is the shared foundation.
- **Migration number:** the next migration is **081** (verified: latest on `origin/dev` is `20260724_080_CreateCustomRecords`). Re-verify against `origin/dev` at the moment of writing the file — SP1 hit an 079→080 collision under concurrent shipping. Migrations are idempotent (`IF NOT EXISTS`) with a matching `_Rollback.sql`; one logical change per migration; header comment with author/date/description (`database-migrations.md`).
- **SQL injection:** the query proc is the designated high-risk review target. No field key reaches SQL text unless it matched a real `FieldDefinition` row for the object (whitelist join); every compared value is read via `JSON_VALUE(@FiltersJson, …)` inside the dynamic SQL (passed to `sp_executesql` as a parameter) — never string-concatenated. Operators/sort-direction are validated against a fixed allow-set before emission. (`api-data-access.md`, `database-stored-procedures.md`.)
- **Proc boilerplate:** every proc begins `SET NOCOUNT ON; SET XACT_ABORT ON;`, uses `CREATE OR ALTER`, excludes soft-deleted rows (`IsDeleted = 0`), has a header comment (`database-stored-procedures.md`).
- **API conventions:** controllers do request/response only; logic in the service; data via procs (`FromSqlRaw`/raw ADO.NET with `SqlParameter`). Every async method takes and passes a `CancellationToken`. Ownership/access via `IAccessGuard` — 403 for access, 404-never-disclose for out-of-scope (`api-record-access.md`, `api-coding-standards.md`). `Cache-Control: private, no-store` default already applied by middleware.
- **Web conventions:** vertical-slice feature module; TanStack Query with exported key factories + `enabled` guards; `apiFetch`/`withQuery` (never hand-built URLs or raw tokens); every design-system component roots a stable `data-ds`; every remote-data component renders loading / error / empty explicitly; named page-size constant in `shared/constants.ts` (no magic numbers); jest-axe assertion on every component test; `data-ds` extraction preserves existing tokens (`web-component-architecture.md`, `web-styling.md`, `web-testing.md`).
- **No new dependencies** without discussion. Use `crypto.randomUUID()` (never a uuid lib).

## Field-type → filter/sort behaviour (used by A2, A4, B3)

| `FieldType` | Filter funnel | Sort cast |
|---|---|---|
| `ShortText` `LongText` `RichText` `Url` | `text` (LIKE contains) | text |
| `Number` `Decimal` `Currency` `Percent` | `number` (`> >= = <= <`) | `DECIMAL(38,10)` |
| `Date` `DateTime` | `date` (from/to range) | `DATETIME2` |
| `SingleSelect` `MultiSelect` | `select` (IN over value) | text |
| `Boolean` `UserReference` `RecordReference` `Calculation` `DerivedCategory` | **not filterable/sortable** (excluded from the funnel + sort set) | — |

Stable columns: `name` → text/`Name`; `created` → date/`CreatedAt`; `updated` → date/`UpdatedAt`.

---

## File Structure

**Slice A (backend)**
- Create: `database/migrations/20260724_081_WidenSavedViewObjectType.sql` (+ `_Rollback.sql`) — widen `SavedView.ObjectType` 16→64, drop `CK_SavedView_ObjectType`.
- Modify: `database/procedures/custom-records/usp_QueryCustomRecords.sql` — rewrite for JSON-field filter/sort.
- Modify: `database/procedures/custom-records/usp_GetCustomRecordById.sql` — add `CreatedBy` to projection.
- Create: `database/tests/custom-records/test_QueryCustomRecords.sql`, extend `test_GetCustomRecordById.sql`, `database/tests/saved-views/test_UpsertSavedView_CustomSlug.sql`.
- Modify: `api/Api/Modules/CustomRecords/CustomRecordsService.cs` (add `QueryAsync` filter/sort marshalling + `BuildFiltersJson`/`ResolveSort`; map `createdBy`).
- Modify: `api/Api/Modules/CustomRecords/CustomRecordDtos.cs` (add `CreatedBy` to `CustomRecordDto` + its keyless projection).
- Modify: `api/Api/Modules/Fields/FieldsController.cs` (`IsValidObjectType` accepts a resolvable custom slug).
- Modify: `api/Api/Modules/SavedViews/SavedViewDtos.cs` (relax `ObjectType` regex).
- Modify: `shared/types/notifications.ts` (`SavedViewObjectType` admits a slug).
- Tests: `api/Api.Tests/Modules/CustomRecords/CustomRecordsServiceQueryTests.cs`, `.../Fields/FieldsControllerObjectTypeTests.cs`.

**Slice B (browse)**
- Create: `shared/types/customRecords.ts` (`CustomRecordDto`, `CustomRecordListRow`, `CustomRecordWriteRequest`).
- Create: `web/src/features/custom-records/api.ts`, `useCustomRecords.ts`, `recordColumns.ts` (schema→columns/filter-types, filter↔clause), `components/CustomRecordsListPage.tsx` (+ `.test.tsx`), `customRecords.css`.
- Modify: `web/src/shared/constants.ts` (`RECORDS_PAGE_SIZE`), `web/src/App.tsx` (list route + `IMPLEMENTED_ROUTES` + CSS import), `web/src/features/objects/components/ObjectsTable.tsx` (+ its test) — "View records" entry.
- Create: `web/e2e/custom-records-browse.spec.ts`.

**Slice C (mutate)**
- Create (extraction): `web/src/shared/components/Form/FieldControl.tsx` (+ `.test.tsx`), `web/src/shared/fields/fieldForm.ts` (+ `.test.ts`) — moved/generalized from `features/requests`.
- Modify: `web/src/features/requests/components/RequestFieldControl.tsx` (re-export the shared control) and `requestForm.ts` (re-export the shared helpers), leaving Requests behaviour unchanged.
- Modify: `web/src/features/custom-records/api.ts` + `useCustomRecords.ts` (create/patch/delete/get + mutations).
- Create: `web/src/features/custom-records/components/CustomRecordCreatePage.tsx` (+ `.test.tsx`), `CustomRecordDetailPage.tsx` (+ `.test.tsx`).
- Modify: `web/src/App.tsx` (`/new` + `/:recordId` routes + `IMPLEMENTED_ROUTES`).
- Create: `web/e2e/custom-records-crud.spec.ts`.

---

# SLICE A — Backend foundation

### Task A1: Migration 081 — generalize SavedView.ObjectType

**Files:**
- Create: `database/migrations/20260724_081_WidenSavedViewObjectType.sql`
- Create: `database/migrations/20260724_081_WidenSavedViewObjectType_Rollback.sql`
- Test: `database/tests/saved-views/test_UpsertSavedView_CustomSlug.sql`

**Interfaces:**
- Produces: `SavedView.ObjectType NVARCHAR(64)`, no `CK_SavedView_ObjectType`. Consumed by A? (nothing) and the frontend saved-views feature (B3) which now passes a slug.

- [ ] **Step 1: Write the failing tSQLt test** — a custom slug objectType is accepted by `usp_UpsertSavedView`.

```sql
CREATE OR ALTER PROCEDURE savedviews.[test UpsertSavedView accepts a custom object slug]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = N'dbo.SavedView';
    DECLARE @out UNIQUEIDENTIFIER;
    EXEC dbo.usp_UpsertSavedView
        @SavedViewId = NULL, @WorkspaceId = '11111111-1111-1111-1111-111111111111',
        @ObjectType = N'vendor', @Name = N'My vendors', @Scope = N'personal',
        @OwnerUserId = '22222222-2222-2222-2222-222222222222', @IsDefault = 0,
        @ColumnsJson = N'["name"]', @FiltersJson = N'{}', @SortJson = N'[]',
        @ActorUserId = '22222222-2222-2222-2222-222222222222', @OutSavedViewId = @out OUTPUT;
    -- FakeTable removes the CHECK, so this test guards the proc contract, not the constraint.
    IF @out IS NULL EXEC tSQLt.Fail 'Expected a saved view id for a custom slug objectType';
END;
```

- [ ] **Step 2: Run it (LocalDB / CI)** — this test passes once the proc exists; the *real* guard is the migration dropping the CHECK on the live table (verified by the smoke in Step 5). Note tSQLt runs in CI, not locally (see `dev-ship-gotchas`).

- [ ] **Step 3: Write the migration** — idempotent widen + drop CHECK.

```sql
-- =============================================
-- Author: AI Solutions | Date: 2026-07-24
-- Description: Widen SavedView.ObjectType to NVARCHAR(64) and drop CK_SavedView_ObjectType
--   so per-object saved views work for custom-object slugs (validity app-enforced), mirroring
--   SP1's CK_FieldDefinition_ObjectType drop.
-- =============================================
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_SavedView_ObjectType')
    ALTER TABLE dbo.SavedView DROP CONSTRAINT CK_SavedView_ObjectType;

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.SavedView') AND name = 'ObjectType'
             AND max_length = 32)  -- NVARCHAR(16) = 32 bytes
    ALTER TABLE dbo.SavedView ALTER COLUMN ObjectType NVARCHAR(64) NOT NULL;
```

- [ ] **Step 4: Write the rollback** — restore width + CHECK (idempotent).

```sql
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SavedView')
           AND name = 'ObjectType' AND max_length = 128)
    ALTER TABLE dbo.SavedView ALTER COLUMN ObjectType NVARCHAR(16) NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_SavedView_ObjectType')
    ALTER TABLE dbo.SavedView ADD CONSTRAINT CK_SavedView_ObjectType
        CHECK (ObjectType IN (N'Request', N'Feature', N'Task', N'Announcement'));
```

- [ ] **Step 5: Apply + smoke on LocalDB** — apply the migration, then `INSERT` a `SavedView` row with `ObjectType = N'vendor'` via `Invoke-Sqlcmd` on `AiSolutionsTrackerDev` (per `dev-ship-gotchas`) and confirm it succeeds; roll back the insert.

- [ ] **Step 6: Commit** — `git -C <worktree> add database/... && git commit -m "feat(db): widen SavedView.ObjectType + drop CHECK for custom slugs (migration 081)"` (commit is performed by the ship flow; stage here).

---

### Task A2: Rewrite `usp_QueryCustomRecords` for JSON-field filter/sort

**Files:**
- Modify: `database/procedures/custom-records/usp_QueryCustomRecords.sql`
- Test: `database/tests/custom-records/test_QueryCustomRecords.sql`

**Interfaces:**
- Consumes: `dbo.CustomRecords` (`RecordId, ObjectDefinitionId, WorkspaceId, Name, FieldValues, CreatedAt, UpdatedAt, IsDeleted`), `dbo.FieldDefinition` (`FieldKey, FieldType, ObjectType`, joined on the object's `ObjectKey`), `dbo.ObjectDefinition` (`ObjectKey`).
- Produces: **two result sets** — (1) page rows `RecordId, Name, FieldValues, RowVer` ordered by the sort; (2) `TotalCount`. Params: `@WorkspaceId, @ObjectDefinitionId, @Page, @PageSize, @FiltersJson NVARCHAR(MAX)=NULL, @SortColumn NVARCHAR(128)=N'name', @SortDir NVARCHAR(4)=N'asc'`. Consumed by A4 (`CustomRecordsService.QueryAsync`).

- [ ] **Step 1: Write the failing tSQLt tests** — one file, these cases (each `FakeTable`s `CustomRecords`, `FieldDefinition`, `ObjectDefinition`, seeds rows, calls the proc, asserts):

```sql
-- test list (names shortened): each is a CREATE OR ALTER PROCEDURE customrecords.[test ...]
--  1. [returns only rows for the given object + workspace]  -- seed a foreign object + foreign ws row; assert excluded
--  2. [excludes soft-deleted rows]
--  3. [text filter on a ShortText field matches contains, case-insensitively]
--  4. [select filter matches any of the values (IN)]
--  5. [number filter >= compares numerically not lexically]  -- values 9 and 100; ">= 10" returns 100 only
--  6. [date range filter on a Date field respects from/to]
--  7. [name contains filter]
--  8. [sort by a Number field desc orders 100 before 9 numerically]
--  9. [sort by name asc]
-- 10. [pagination returns page 2 of size 1 and TotalCount reflects the full match set]
-- 11. [NULL @FiltersJson returns all rows for the object]
-- 12. [an unknown filter key that is not a real FieldDefinition is ignored, not errored]
```

Representative test body (case 5 — the numeric-vs-lexical guard, the whole point of the proc):

```sql
CREATE OR ALTER PROCEDURE customrecords.[test number filter >= compares numerically]
AS
BEGIN
    EXEC tSQLt.FakeTable @TableName = N'dbo.CustomRecords';
    EXEC tSQLt.FakeTable @TableName = N'dbo.FieldDefinition';
    EXEC tSQLt.FakeTable @TableName = N'dbo.ObjectDefinition';
    DECLARE @obj UNIQUEIDENTIFIER = '33333333-3333-3333-3333-333333333333';
    DECLARE @ws  UNIQUEIDENTIFIER = '11111111-1111-1111-1111-111111111111';
    INSERT dbo.ObjectDefinition (Id, WorkspaceId, ObjectKey, IsDeleted)
        VALUES (@obj, @ws, N'vendor', 0);
    INSERT dbo.FieldDefinition (WorkspaceId, ObjectType, FieldKey, FieldType, IsDeleted)
        VALUES (@ws, N'vendor', N'spend', N'Number', 0);
    INSERT dbo.CustomRecords (RecordId, ObjectDefinitionId, WorkspaceId, Name, FieldValues, IsDeleted)
        VALUES (NEWID(), @obj, @ws, N'Big',   N'{"spend":100}', 0),
               (NEWID(), @obj, @ws, N'Small', N'{"spend":9}',   0);

    CREATE TABLE #act (RecordId UNIQUEIDENTIFIER, Name NVARCHAR(400), FieldValues NVARCHAR(MAX), RowVer VARBINARY(8));
    INSERT #act EXEC dbo.usp_QueryCustomRecords
        @WorkspaceId = @ws, @ObjectDefinitionId = @obj, @Page = 1, @PageSize = 25,
        @FiltersJson = N'{"spend":{"type":"number","op":">=","value":10}}';

    CREATE TABLE #exp (Name NVARCHAR(400)); INSERT #exp VALUES (N'Big');
    SELECT Name INTO #actNames FROM #act;
    EXEC tSQLt.AssertEqualsTable '#exp', '#actNames';
END;
```

- [ ] **Step 2: Run to verify they fail** (proc still the 1b stub — filters ignored, so case 5 returns both rows). CI/LocalDB.

- [ ] **Step 3: Write the proc.** Structure (fill in every predicate family from the mapping table):

```sql
CREATE OR ALTER PROCEDURE dbo.usp_QueryCustomRecords
    @WorkspaceId UNIQUEIDENTIFIER, @ObjectDefinitionId UNIQUEIDENTIFIER,
    @Page INT, @PageSize INT, @FiltersJson NVARCHAR(MAX) = NULL,
    @SortColumn NVARCHAR(128) = N'name', @SortDir NVARCHAR(4) = N'asc'
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @page INT = CASE WHEN @Page < 1 THEN 1 ELSE @Page END;
    DECLARE @size INT = CASE WHEN @PageSize < 1 THEN 20 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    DECLARE @dir  NVARCHAR(4) = CASE WHEN LOWER(@SortDir) = N'desc' THEN N'DESC' ELSE N'ASC' END;

    DECLARE @slug NVARCHAR(64) =
        (SELECT ObjectKey FROM dbo.ObjectDefinition WHERE Id = @ObjectDefinitionId AND IsDeleted = 0);

    -- Whitelist of the object's user fields (key + type). Only keys present here may enter SQL text.
    DECLARE @fields TABLE (FieldKey NVARCHAR(64) PRIMARY KEY, FieldType NVARCHAR(32));
    INSERT @fields
        SELECT FieldKey, FieldType FROM dbo.FieldDefinition
        WHERE WorkspaceId = @WorkspaceId AND ObjectType = @slug AND IsDeleted = 0;

    -- Build the WHERE from OPENJSON(@FiltersJson): for each filter key, if it is name/created/updated
    -- OR joins @fields, append a predicate. Field values are read via JSON_VALUE(@FiltersJson,...) at
    -- exec time (never concatenated). Operators validated to the {>,>=,=,<=,<} set before emission.
    DECLARE @where NVARCHAR(MAX) = N'';
    IF @FiltersJson IS NOT NULL
    BEGIN
        SELECT @where = @where + f.predicate
        FROM OPENJSON(@FiltersJson) k
        CROSS APPLY (SELECT
            predicate = CASE
              WHEN k.[key] = N'name'
                THEN N' AND cr.Name LIKE N''%'' + JSON_VALUE(@FiltersJson, ''$."name".contains'') + N''%'''
              WHEN k.[key] = N'created'
                THEN N' AND (JSON_VALUE(@FiltersJson,''$."created".from'') IS NULL OR cr.CreatedAt >= TRY_CAST(JSON_VALUE(@FiltersJson,''$."created".from'') AS DATETIME2))'
                   + N' AND (JSON_VALUE(@FiltersJson,''$."created".to'')   IS NULL OR cr.CreatedAt <= TRY_CAST(JSON_VALUE(@FiltersJson,''$."created".to'')   AS DATETIME2))'
              -- ... same for 'updated' vs cr.UpdatedAt ...
              WHEN EXISTS (SELECT 1 FROM @fields ff WHERE ff.FieldKey = k.[key]) THEN
                (SELECT dbo.fn_BuildCustomRecordPredicate(k.[key], ff.FieldType) FROM @fields ff WHERE ff.FieldKey = k.[key])
              ELSE N''  -- unknown key: ignored, not an error (test case 12)
            END) f;
    END;

    -- Sort column: stable columns or a whitelisted field key, else default to Name.
    DECLARE @orderExpr NVARCHAR(400) =
        CASE @SortColumn
            WHEN N'name'    THEN N'cr.Name'
            WHEN N'created' THEN N'cr.CreatedAt'
            WHEN N'updated' THEN N'cr.UpdatedAt'
            ELSE (SELECT CASE
                    WHEN ff.FieldType IN (N'Number',N'Decimal',N'Currency',N'Percent')
                        THEN N'TRY_CAST(JSON_VALUE(cr.FieldValues, ''$."' + ff.FieldKey + N'"'') AS DECIMAL(38,10))'
                    WHEN ff.FieldType IN (N'Date',N'DateTime')
                        THEN N'TRY_CAST(JSON_VALUE(cr.FieldValues, ''$."' + ff.FieldKey + N'"'') AS DATETIME2)'
                    ELSE N'JSON_VALUE(cr.FieldValues, ''$."' + ff.FieldKey + N'"'')' END
                  FROM @fields ff WHERE ff.FieldKey = @SortColumn)
        END;
    IF @orderExpr IS NULL SET @orderExpr = N'cr.Name';

    DECLARE @base NVARCHAR(MAX) =
        N'FROM dbo.CustomRecords cr WHERE cr.WorkspaceId = @ws AND cr.ObjectDefinitionId = @obj AND cr.IsDeleted = 0'
        + @where;

    DECLARE @sql NVARCHAR(MAX) =
        N'SELECT cr.RecordId, cr.Name, cr.FieldValues, cr.RowVer ' + @base
        + N' ORDER BY ' + @orderExpr + N' ' + @dir + N', cr.RecordId ASC'
        + N' OFFSET (@p-1)*@s ROWS FETCH NEXT @s ROWS ONLY;'
        + N'SELECT COUNT(*) AS TotalCount ' + @base + N';';

    EXEC sys.sp_executesql @sql,
        N'@ws UNIQUEIDENTIFIER, @obj UNIQUEIDENTIFIER, @p INT, @s INT, @FiltersJson NVARCHAR(MAX)',
        @ws = @WorkspaceId, @obj = @ObjectDefinitionId, @p = @page, @s = @size, @FiltersJson = @FiltersJson;
END;
```

`fn_BuildCustomRecordPredicate(@key, @type)` (a scalar function in the same file, created before the proc) returns the parameterized predicate for a field filter — the `@key` is only ever a whitelisted key. Bodies per type (values via `JSON_VALUE(@FiltersJson, '$."<key>".…')`):
  - `select`: `AND EXISTS (SELECT 1 FROM OPENJSON(@FiltersJson, '$."<key>".values') v WHERE v.value = JSON_VALUE(cr.FieldValues,'$."<key>"'))`
  - `text`: `AND JSON_VALUE(cr.FieldValues,'$."<key>"') LIKE N'%' + JSON_VALUE(@FiltersJson,'$."<key>".contains') + N'%'`
  - `number`: `AND TRY_CAST(JSON_VALUE(cr.FieldValues,'$."<key>"') AS DECIMAL(38,10)) <op> TRY_CAST(JSON_VALUE(@FiltersJson,'$."<key>".value') AS DECIMAL(38,10))` where `<op>` is read from `'$."<key>".op'` and matched to the fixed set `{>,>=,=,<=,<}` (else the predicate is empty).
  - `date`: two `TRY_CAST(... AS DATETIME2)` bounds from `.from`/`.to` (null-guarded).

  > Injection note: `<key>` is validated (whitelist join) and, being a generated slug, contains no `"`; still, the function only emits it inside a `'$."<key>"'` path built from a whitelisted value. All comparands come from `JSON_VALUE(@FiltersJson,…)` with `@FiltersJson` passed as an `sp_executesql` parameter. The operator is chosen from a fixed allow-set. No user value is concatenated into SQL text.

- [ ] **Step 4: Run the tests to green** (LocalDB/CI). Iterate the predicate function until all 12 pass — especially case 5 (numeric) and case 8 (numeric sort).

- [ ] **Step 5: Commit** — stage `database/procedures/custom-records/usp_QueryCustomRecords.sql` + the test file.

---

### Task A3: Add `CreatedBy` to `usp_GetCustomRecordById` + DTO

**Files:**
- Modify: `database/procedures/custom-records/usp_GetCustomRecordById.sql`
- Modify: `api/Api/Modules/CustomRecords/CustomRecordDtos.cs`
- Test: extend `database/tests/custom-records/test_GetCustomRecordById.sql`

**Interfaces:**
- Produces: `CustomRecordDto.CreatedBy` (string, camelCase `createdBy`) on Create/Get/Patch responses.

- [ ] **Step 1: Failing tSQLt** — assert the Get proc result set includes a non-null `CreatedBy` equal to the seeded value.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3:** add `cr.CreatedBy` to the proc's `SELECT`; add `CreatedBy` (`string`) to `CustomRecordDto` and its keyless projection record in `CustomRecordDtos.cs`; ensure `CustomRecordsService` Get/Create/Patch mapping carries it (the projection binds by column name — confirm the projection type lists `CreatedBy`).
- [ ] **Step 4: Run to green** (tSQLt + `dotnet build`).
- [ ] **Step 5: Commit.**

---

### Task A4: `CustomRecordsService.QueryAsync` — filter/sort marshalling

**Files:**
- Modify: `api/Api/Modules/CustomRecords/CustomRecordsService.cs`
- Test: `api/Api.Tests/Modules/CustomRecords/CustomRecordsServiceQueryTests.cs`

**Interfaces:**
- Consumes: `PaginatedQuery` (`page, pageSize, filters?: Dictionary<string,JsonElement>, sort?: SortSpec[]`), `usp_QueryCustomRecords` (two result sets, A2), `IObjectSchemaService.GetByIdAsync` (object existence → 404), `IFieldSchemaService.GetSchemaAsync(ws, slug, ct)` (to know each filter/sort key's `FieldType` for marshalling).
- Produces: `PaginatedResponse<CustomRecordListRow>`; private static `BuildFiltersJson(IReadOnlyDictionary<string,JsonElement>?, schema)` and `ResolveSort(IReadOnlyList<SortSpec>?, schema)`.

- [ ] **Step 1: Write failing xUnit tests** (mock `IObjectSchemaService`, `IFieldSchemaService`, and the DB via the existing test seam — mirror the 1b `CustomRecordsService` tests):

```csharp
// BuildFiltersJson_SelectClause_EmitsTypeAndValues
// BuildFiltersJson_NumberClause_EmitsOpAndValue
// BuildFiltersJson_UnknownFieldKey_IsDropped               // key not in schema → not in JSON
// ResolveSort_FieldKey_ResolvesToKeyAndDirection
// ResolveSort_NoSort_DefaultsToNameAsc
// QueryAsync_ObjectNotFound_ReturnsNotFound               // never discloses
// QueryAsync_PageSizeOver100_RejectedByController          // (controller test — see note)
// QueryAsync_Cancellation_Throws
// QueryAsync_MapsRows_ToCustomRecordListRow
```

Representative:

```csharp
[Fact]
public void BuildFiltersJson_NumberClause_EmitsOpAndValue()
{
    var schema = SchemaWith(("spend", "Number"));
    var filters = ParseFilters("""{ "spend": { "kind":"number", "op":">=", "value":10 } }""");
    var json = CustomRecordsService.BuildFiltersJson(filters, schema);
    using var doc = JsonDocument.Parse(json);
    var spend = doc.RootElement.GetProperty("spend");
    Assert.Equal("number", spend.GetProperty("type").GetString());
    Assert.Equal(">=", spend.GetProperty("op").GetString());
    Assert.Equal(10, spend.GetProperty("value").GetInt32());
}
```

- [ ] **Step 2: Run to fail** (`dotnet test --filter CustomRecordsServiceQueryTests`).
- [ ] **Step 3: Implement** `QueryAsync` (raw ADO.NET two-result-set read like `RequestsService.QueryAsync` — open the `DbConnection`, `sp_executesql` params via `SqlParameter`, read page rows, `NextResultAsync()` → `TotalCount`), `BuildFiltersJson` (translate each `FilterClause` to the proc JSON shape `{type,…}`, dropping keys not in the schema; map stable keys `name/created/updated` straight through), `ResolveSort` (first `SortSpec` whose column is `name/created/updated` or a schema field key; normalize direction). Clamp page/pageSize; the controller already rejects `pageSize > 100`.
- [ ] **Step 4: Run to green.**
- [ ] **Step 5: Commit.**

---

### Task A5: `FieldsController` accepts custom object slugs

**Files:**
- Modify: `api/Api/Modules/Fields/FieldsController.cs`
- Test: `api/Api.Tests/Modules/Fields/FieldsControllerObjectTypeTests.cs`

**Interfaces:**
- Consumes: `IObjectSchemaService` (resolve the slug → a real custom `ObjectDefinition` in the workspace).
- Produces: `GET /fields?objectType=<slug>` → 200 `WorkspaceFieldSchemaDto` for a custom object; 404 for an unknown slug; built-ins unchanged.

- [ ] **Step 1: Failing xUnit** — `GetFields_CustomSlug_Returns200WithSchema`; `GetFields_UnknownSlug_Returns404`; `GetFields_BuiltinType_Unchanged`.
- [ ] **Step 2: Run to fail** (custom slug currently 400).
- [ ] **Step 3: Implement** — replace the fixed `IsValidObjectType` gate: accept the five built-ins as today; otherwise resolve the slug via `IObjectSchemaService` (workspace-scoped) — found → pass through to `GetSchemaAsync`; not found → `NotFound` (never disclose). Keep the `objectType` default of `"Request"`.
- [ ] **Step 4: Run to green.**
- [ ] **Step 5: Commit.**

---

### Task A6: Relax saved-view objectType validators (C# + TS)

**Files:**
- Modify: `api/Api/Modules/SavedViews/SavedViewDtos.cs`
- Modify: `shared/types/notifications.ts`
- Test: `api/Api.Tests/Modules/SavedViews/SavedViewUpsertValidationTests.cs` (add a case)

**Interfaces:**
- Produces: `SavedViewUpsertRequest.ObjectType` accepts a slug; TS `SavedViewObjectType` admits a custom slug.

- [ ] **Step 1: Failing xUnit** — model-validate a `SavedViewUpsertRequest` with `ObjectType = "vendor"` and assert it is valid (currently the regex rejects it).
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** — change the regex to `^(Request|Feature|Task|Announcement|[a-z0-9][a-z0-9-]{0,63})$`; in `shared/types/notifications.ts` widen `SavedViewObjectType` to `'Request' | 'Feature' | 'Task' | 'Announcement' | (string & {})` (Open question 1 — this preserves autocomplete for built-ins while admitting slugs). **Decision:** do **not** add `ObjectDefinition` cross-validation in `SavedViewsService` — a stray saved view is inert and app-scoped, and the frontend only ever sends real slugs; adding an `IObjectSchemaService` dependency to `SavedViewsService` is unjustified churn.
- [ ] **Step 4: Run to green** (`dotnet test` + `tsc`).
- [ ] **Step 5: Commit.**

**Slice A gate:** run `/dev-review-and-remediate` (backend). The A2 proc is the injection-safety focus.

---

# SLICE B — Browse surface

### Task B1: Shared custom-record TS types

**Files:**
- Create: `shared/types/customRecords.ts`

**Interfaces:**
- Produces: `CustomRecordDto` (`id, objectDefinitionId, name, fields: Record<string, unknown>, createdAt, updatedAt, createdBy, eTag`), `CustomRecordListRow` (`id, name, fields, eTag`), `CustomRecordWriteRequest` (`name: string; fields: Record<string, unknown>`). Consumed by B2, C2.

- [ ] **Step 1:** write the file (types only — no test needed for pure interface declarations). Match camelCase exactly against `CustomRecordDtos.cs`.
- [ ] **Step 2: `tsc` clean.** Commit.

---

### Task B2: `custom-records` data layer (query + list hook)

**Files:**
- Create: `web/src/features/custom-records/api.ts`, `web/src/features/custom-records/useCustomRecords.ts`
- Modify: `web/src/shared/constants.ts`
- Test: `web/src/features/custom-records/useCustomRecords.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `withQuery`, `PaginatedQuery`, `PaginatedResponse`, `CustomRecordListRow`.
- Produces: `queryRecords(workspaceId, objectId, query, signal): Promise<PaginatedResponse<CustomRecordListRow>>` (POST `/v1/workspaces/{ws}/objects/{objectId}/records/query`); `customRecordsListKey(ws, objectId, query)`; `useCustomRecordsList(ws, objectId, query)`. `RECORDS_PAGE_SIZE = 25`.

- [ ] **Step 1: Failing test** — `useCustomRecordsList` calls `queryRecords` with the right path/body and returns items; keyed by `['custom-records', ws, objectId, query]`; disabled when `objectId` absent. Mock `apiFetch`.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** `api.ts` (`queryRecords` via `apiFetch` POST) and `useCustomRecords.ts` (key factory + `useQuery` with `enabled: Boolean(objectId)`, `queryFn: ({signal}) => queryRecords(...)`); add `export const RECORDS_PAGE_SIZE = 25;` to `shared/constants.ts`.
- [ ] **Step 4: Run to green.** Commit.

---

### Task B3: `CustomRecordsListPage`

**Files:**
- Create: `web/src/features/custom-records/recordColumns.ts` (+ `.test.ts`), `web/src/features/custom-records/components/CustomRecordsListPage.tsx` (+ `.test.tsx`), `web/src/features/custom-records/customRecords.css`
- Reference (clone, do not import internals): `web/src/features/requests/components/RequestsListPage.tsx`

**Interfaces:**
- Consumes: `useObjects` (resolve `objectKey`→`{id,name,pluralLabel}`), `fetchWorkspaceFields(ws, slug)` (schema→columns), `useCustomRecordsList`, `useSavedViews(ws, slug)` + saved-view mutations, shared `TableShell/TableFooter/ViewBar/SavedViewPicker/SavedViewEditor/FilterFunnel`, `EdgeStates`, `RowActionsMenu`.
- Produces: default-exported route component; `recordColumns.ts` pure helpers `buildColumns(fields)`, `filterTypeFor(field)`, `filterValueToClause`, `clauseToFilterValue`.

- [ ] **Step 1: Failing pure-helper tests** (`recordColumns.test.ts`): `buildColumns` yields `Name` + one column per filterable user field ordered by `sortOrder`, excluding the non-filterable types; `filterTypeFor` maps each `FieldType` per the mapping table; `filterValueToClause`/`clauseToFilterValue` round-trip a number expression (`>=10`) and a select.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement `recordColumns.ts`** from the mapping table (reuse `parseNumberExpression`-style logic from `RequestsListPage`; extract it if convenient).
- [ ] **Step 4: Run to green.**
- [ ] **Step 5: Failing component tests** (`CustomRecordsListPage.test.tsx`, wrap in the TanStack Query test provider from `test-utils`; include a `jest-axe` assertion each):
  - loading → `role="status"`; error → `role="alert"`; zero-data empty → `data-ds="empty-zero"`; filtered-to-zero → `data-ds="empty-filtered"` + Clear filters; rows render Name + a field value; "New record" primary action navigates to `/objects/vendor/new`; a row kebab exposes View/Edit/Delete; changing a filter refetches with the clause in the query body; axe clean on the populated state.
- [ ] **Step 6: Run to fail.**
- [ ] **Step 7: Implement the page** — clone `RequestsListPage` structure: resolve the object from `useObjects` by `:objectKey` (404-style `NoAccessPage`/not-found if absent), fetch schema, build columns, hold `{activeViewId, filters, sort, page}` state, assemble `PaginatedQuery`, wire `TableShell` (`renderFilter` → `FilterFunnel` typed by `filterTypeFor`), `ViewBar` (pills + "New record" primary), `SavedViewPicker`/`SavedViewEditor` with `objectType={slug}`, `TableFooter` with `RECORDS_PAGE_SIZE`. Row-click → `/objects/:objectKey/:recordId`; kebab via `RowActionsMenu`. Root `data-ds="page"` (or reuse the Requests list's token). Explicit three states.
- [ ] **Step 8: Run to green.** Commit.

---

### Task B4: Routing + Objects-tab entry

**Files:**
- Modify: `web/src/App.tsx` (list route + `IMPLEMENTED_ROUTES` + CSS import)
- Modify: `web/src/features/objects/components/ObjectsTable.tsx` (+ `ObjectsTable.test.tsx`)

**Interfaces:**
- Produces: route `/objects/:objectKey` → `CustomRecordsListPage`; Objects-tab row "View records" → `navigate('/objects/' + object.objectKey)` for custom objects only.

- [ ] **Step 1: Failing test** — `ObjectsTable` renders a "View records" control for a custom object row (not for built-ins) and, on activate, calls the router navigate with `/objects/<objectKey>`.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** — add the affordance to the row (a trailing `IconButton`/menu item, `data-ds="icon-btn"`, accessible name "View records"); guard on `!object.isSystem`. Register the route in `App.tsx`, add its path to `IMPLEMENTED_ROUTES`, import `customRecords.css`.
- [ ] **Step 4: Run to green.**
- [ ] **Step 5: Commit.**

---

### Task B5: E2E — browse + filter + saved view

**Files:**
- Create: `web/e2e/custom-records-browse.spec.ts`

- [ ] **Step 1:** write a Playwright flow (per `web-testing.md`: `getByRole`/`getByLabel`, reset storage in `beforeEach` via goto+clear+reload). Steps: open the Objects admin tab → "View records" on a seeded custom object → list renders → apply a select filter → row set narrows → save the current view → reload → the saved view reapplies. Include an `@axe-core/playwright` check on the list page in `accessibility.spec.ts`.
- [ ] **Step 2:** run against the local stack (web:5173 / API:5080 per `dev-ship-gotchas`).
- [ ] **Step 3: Commit.**

**Slice B gate:** `/dev-review-and-remediate` (web scope). Note the `check-design-conformance.sh --web-required` hook is CI-only on Windows (verify raw-colour/radii on the diff by grep — `dev-ship-gotchas`).

---

# SLICE C — Mutate surface

### Task C1: Extract shared `FieldControl` + `fieldForm` helpers

**Files:**
- Create: `web/src/shared/components/Form/FieldControl.tsx` (+ `.test.tsx`), `web/src/shared/fields/fieldForm.ts` (+ `.test.ts`)
- Modify: `web/src/features/requests/components/RequestFieldControl.tsx`, `web/src/features/requests/requestForm.ts` (re-export shims)

**Interfaces:**
- Produces: `FieldControl` (props `field: FieldDefinitionDto, value, onChange, disabled?, error?, optional?, hint?`) switching on `field.fieldType` → shared Form controls (identical mapping to `RequestFieldControl`); `fieldForm.ts` — `groupFieldsBySection`, `evaluateFieldConditions`, `validateFieldForm(fields, values)`. Consumed by C3, C4, and (via re-export) the existing Requests surfaces.

- [ ] **Step 1: Failing tests** — move the existing `RequestFieldControl`/`requestForm` unit tests to target the shared modules (same assertions), plus one asserting `RequestFieldControl` still renders identically (re-export shim). axe on the control test.
- [ ] **Step 2: Run to fail** (shared modules don't exist yet).
- [ ] **Step 3: Implement** — move the component + pure helpers into the shared locations verbatim (generalize any Request-specific naming to `field`/`value`); make `features/requests/components/RequestFieldControl.tsx` re-export `FieldControl` and `requestForm.ts` re-export the moved helpers so no Requests call-site changes. Root `data-ds` unchanged (delegated to the shared Form controls).
- [ ] **Step 4: Run to green** — the shared tests AND the full existing Requests test suite must pass unchanged (no behavioural regression).
- [ ] **Step 5: Commit.**

---

### Task C2: Data layer — create/patch/delete/get + mutations

**Files:**
- Modify: `web/src/features/custom-records/api.ts`, `web/src/features/custom-records/useCustomRecords.ts`
- Test: extend `web/src/features/custom-records/useCustomRecords.test.ts`

**Interfaces:**
- Produces: `getRecord`, `createRecord`, `patchRecord`, `deleteRecord` (api); `customRecordKey(recordId)`; `useCustomRecord(ws, objectId, recordId)`; `useCreateCustomRecord`, `usePatchCustomRecord`, `useDeleteCustomRecord` (invalidate `['custom-records', ws, objectId]`; detail `setQueryData`).

- [ ] **Step 1: Failing tests** — create posts `CustomRecordWriteRequest` and returns `CustomRecordDto`; patch sends the full field map to the record path; delete calls DELETE; mutations invalidate the list key. Mock `apiFetch`.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** the four api functions + the hooks. (No `ifMatch` on patch — SP1 is last-write-wins.)
- [ ] **Step 4: Run to green.** Commit.

---

### Task C3: `CustomRecordCreatePage`

**Files:**
- Create: `web/src/features/custom-records/components/CustomRecordCreatePage.tsx` (+ `.test.tsx`)
- Reference: `web/src/features/requests/components/IntakeFormPage.tsx`

**Interfaces:**
- Consumes: `useObjects`, `fetchWorkspaceFields`, shared `FieldControl` + `fieldForm` helpers, `useCreateCustomRecord`.
- Produces: route component for `/objects/:objectKey/new`.

- [ ] **Step 1: Failing tests** (+ axe): renders a Name field + a control per user field grouped by section; submitting with a required field empty shows the inline `role="alert"` error and does **not** call create; a valid submit calls `createRecord` with `{name, fields}` and navigates to the new record's detail; an object with zero user fields submits with Name only.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** — clone `IntakeFormPage`: seed empty `values`, group via `groupFieldsBySection`, render `FieldControl`s, validate on submit via `validateFieldForm`, `POST`, navigate. Root `data-ds` per the intake form.
- [ ] **Step 4: Run to green.** Commit.

---

### Task C4: `CustomRecordDetailPage`

**Files:**
- Create: `web/src/features/custom-records/components/CustomRecordDetailPage.tsx` (+ `.test.tsx`)
- Reference: `web/src/features/requests/components/RecordDetailPage.tsx` (structure only — no stepper/tabs)

**Interfaces:**
- Consumes: `useObjects`, `useCustomRecord`, `fetchWorkspaceFields`, shared `FieldControl` + `groupFieldsBySection`, `usePatchCustomRecord`, `useDeleteCustomRecord`.
- Produces: route component for `/objects/:objectKey/:recordId`.

- [ ] **Step 1: Failing tests** (+ axe): renders breadcrumb + header (name, id, Delete) + meta strip (Created / Last updated / Created by) + a fields panel of inline controls seeded from `record.fields`; editing a field triggers a debounced `patchRecord` with the **full** field map and shows the "All changes saved" `aria-live` indicator; Delete calls `deleteRecord` and navigates back to the list; 403 renders `NoAccessPage` (non-disclosure).
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** — clone `RecordDetailPage`'s header/meta/breadcrumb; single fields panel grouped by section with debounced autosave (`SAVE_DEBOUNCE_MS`) via `usePatchCustomRecord` (send `{name, fields: allValues}`); no `ifMatch`. No stepper, no tabs. `NoAccessPage` on 403.
- [ ] **Step 4: Run to green.** Commit.

---

### Task C5: Routes for create + detail

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1:** add `/objects/:objectKey/new` → `CustomRecordCreatePage` and `/objects/:objectKey/:recordId` → `CustomRecordDetailPage` as siblings of the list route; add both to `IMPLEMENTED_ROUTES`. (Order the `/new` route before `/:recordId` so it isn't captured as a record id.)
- [ ] **Step 2:** a routing smoke test (render the app at each path with a seeded query client → the right component mounts). Commit.

---

### Task C6: E2E — create → edit → delete

**Files:**
- Create: `web/e2e/custom-records-crud.spec.ts`

- [ ] **Step 1:** Playwright flow: from a custom object's records list → "New record" → fill Name + a field → submit → lands on detail → edit a field → "All changes saved" appears → reload → the edit persisted → Delete → back on the list without the record. axe check on create + detail in `accessibility.spec.ts`.
- [ ] **Step 2:** run against the local stack.
- [ ] **Step 3: Commit.**

**Slice C gate:** `/dev-review-and-remediate` (web scope).

---

## Self-Review

**Spec coverage:**
- Part 1A (field-schema endpoint) → **A5**. Part 1B (saved-view generalization) → **A1** (DB) + **A6** (C#/TS). Part 1C (JSON filter/sort) → **A2** (proc) + **A4** (service). Part 1D (`createdBy`) → **A3**.
- Part 2 data layer → **B1/B2/C2**; shared `FieldControl` extraction → **C1**; list → **B3**; create → **C3**; detail → **C4**; routing + Objects-tab entry → **B4/C5**; `RECORDS_PAGE_SIZE` → **B2**.
- Part 3 slicing → the A/B/C structure. Testing: tSQLt → **A1/A2/A3**; xUnit → **A4/A5/A6**; jest+axe → **B3/C1/C3/C4**; Playwright → **B5/C6**. No spec requirement is unmapped.

**Placeholder scan:** the frontend clone tasks (B3, C3, C4) reference a concrete source file plus explicit adaptations and real test-case lists rather than reproducing 400–600-line components — deliberate (reproducing them verbatim invites drift from the tested originals). Every backend task carries real SQL/C# and concrete test bodies. No "TBD"/"add error handling"/"similar to Task N" placeholders remain.

**Type consistency:** `CustomRecordDto`/`CustomRecordListRow`/`CustomRecordWriteRequest` are defined once (B1) and consumed unchanged (B2/C2); `createdBy` added in A3 is reflected in B1's `CustomRecordDto`. `buildColumns`/`filterTypeFor`/`filterValueToClause`/`clauseToFilterValue` (B3) match their consumers. `BuildFiltersJson`/`ResolveSort` signatures (A4) match the proc params (A2). `FieldControl`/`fieldForm` names (C1) match C3/C4 consumers.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-24-custom-object-records-ui.md`.** It ships as a pair with the spec on branch `fix/custom-object-records-ui`; the three slices then build via the project's `/dev-build-application` pipeline (each slice is a reviewable unit gated by `/dev-review-and-remediate` before `/dev-ship`).
