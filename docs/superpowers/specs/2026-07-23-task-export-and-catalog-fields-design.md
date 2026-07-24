# Task object — surfaceable + exportable attributes

**Date:** 2026-07-23
**Status:** Approved (build)

## Problem

The Task object's core attributes (parent Request, assignee, status, phase, completed
date, notes) are stored on `dbo.Tasks` but are not **tracked as defined fields** anywhere
in the Fields catalog, and Task is **absent from the export system** entirely — there is no
`TaskIoObject`, so tasks cannot be exported. The user wants those six attributes surfaced as
first-class defined fields (like Request's own fields, *not* the generic locked "System"
auto-fields) and exportable to CSV from the workspace Import/Export page.

Data already exists on `TaskDto` / `dbo.Tasks`: `RecordId` (parent Request), `AssigneeUserId`,
`Status`, `Phase`, `CompletedAt`, `Notes`. This work only **surfaces** and **exports** it.

## Scope

Two pieces. Explicitly **not** building: an all-tasks grid page, Task import, a row-preview
change to the export wizard, or any `dbo.PlatformField` schema change.

### Piece 1 — Surface the six in the Fields catalog (migration only)

Seed six **Global**, read-only `FieldDefinition` rows for `ObjectType='Task'` on the AI
Solutions hub workspace (`1A150000-0000-4000-8000-000000000001`), mirroring how the Task field
library (migration 021) seeds Task fields:

| FieldKey       | DisplayName    | FieldType         |
| -------------- | -------------- | ----------------- |
| `parentRequest`| Request        | `RecordReference` |
| `assignee`     | Assignee       | `UserReference`   |
| `status`       | Status         | `SingleSelect`    |
| `phase`        | Phase          | `SingleSelect`    |
| `completedAt`  | Completed date | `DateTime`        |
| `notes`        | Notes          | `LongText`        |

`Location='Global'`, `Category='Platform'`, `IsReadOnly=1`, `IsPlatformDefined=0`. The existing
catalog read path already surfaces Global, non-platform-defined `FieldDefinition` rows for the
Task object on the **Platform Fields tab** (`usp_GetPlatformFieldCatalog` +
`FieldSchemaService.BuildPlatformCatalogRows` step 3), read-only. They render as normal defined
fields — the same species and `Source` as Request's own fields — **not** the locked System band.
No catalog **code** change is needed.

Idempotent guard: the `UX_FieldDefinition_Global_Object_Key` unique index (`ObjectType, FieldKey
WHERE Location='Global'`) backs a `NOT EXISTS` insert. Rollback hard-deletes the six Global rows.

### Piece 2 — Make Task exportable (new read path + descriptor)

- **`usp_GetTasksForWorkspace`** — workspace-scoped, paginated (`OFFSET/FETCH`), `LEFT JOIN
  dbo.Users` to resolve the assignee display name in SQL (no N+1). Access is the upstream gate:
  `ExportService.ExportObjectAsync` checks `HasWorkspaceLevelAsync(userId, workspaceId, Viewer)`
  before `BuildExportAsync`, so the workspace scope IS the entitlement (same model as Request/
  Feature export — export never widens access, BS §22.4).
- **`WorkspaceTaskExportRow`** keyless entity + `AppDbContext` registration; **`TasksService.
  QueryWorkspaceTasksAsync`** binds the proc via `FromSqlRaw` + `SqlParameter`.
- **`TaskIoObject : IIoObject`** — **export-only** (`CanImport=false`, no `IIoImporter`).
  Export columns: `task` (Title, `AlwaysIncluded` identity), `request` (parent RecordId),
  `assignee` (name), `status`, `phase`, `completedDate`, `notes`. `BuildExportAsync` pages the
  query and projects each row; never returns null (workspace object). Registered in `Program.cs`
  beside Request/Feature. Task then appears in the export wizard's object picker automatically —
  **no web change** (the wizard is data-driven).

Titles/notes are Confidential — written to the response, never logged (api-pii-handling.md).

## Tests

- tSQLt `test_usp_GetTasksForWorkspace` — returns a workspace's tasks with assignee name,
  excludes soft-deleted, excludes other workspaces, pagination.
- xUnit `TaskIoObjectTests` — metadata (export-only, identity column), projection, paging across
  pages, row-cap trim, cancellation.
- xUnit `TasksService.QueryWorkspaceTasksAsync` covered via an integration test against the proc.
