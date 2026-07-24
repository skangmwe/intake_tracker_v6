# Custom-object records — storage & schema foundation (design)

**Date:** 2026-07-24
**Status:** Draft (for review)
**Program:** "Custom objects become first-class" — give admin-created custom objects real records,
fields, in-app CRUD, and CSV import/export. This spec is **Sub-project 1 of ~5** (the backend
foundation). Later sub-projects: 2) record CRUD UI, 3) fields-on-custom-objects UI,
4) record list/detail UI, 5) import/export via a generic dynamic descriptor.

## Problem

Custom objects (`dbo.ObjectDefinition`, created via **Fields & objects → Objects → New object**) are
**metadata-only** today: `ObjectSchemaService.MapCustom` hard-codes `RecordsCount: 0, FieldsCount: 0`,
there is no records table for them, and `FieldDefinition.ObjectType`'s CHECK constraint only permits
the five built-ins (`Request/Task/Feature/ToolkitItem/Attachment`). So a custom object is a name +
label + description + sidebar setting — it can hold neither fields nor records. Everything the program
wants (CRUD, import/export) needs those two things to exist first. This sub-project builds them.

## Goal (SP1)

An admin can, **through the API and the existing Fields tab**, (a) add fields to a custom object and
(b) create / read / update / delete / list records of that object. No new UI in this sub-project;
correctness is provable end-to-end via the API + the Fields tab. This is the load-bearing base the
UI and import/export sub-projects build on.

## Architectural spine (applies to the whole program)

1. **One generic records table, not per-object DDL.** All custom-object records live in a single
   `dbo.CustomRecords` table, discriminated by `ObjectDefinitionId`, with content stored in a
   `FieldValues` JSON map keyed by field key — the **same model Requests and Features already use**.
   This means `FieldValuesProjector`, the workspace-export procs, and the field-catalog reads all
   extend to custom objects with no new concepts (SP5). No dynamic `CREATE TABLE`, no per-object
   schema drift.

2. **Fields reuse the existing pipeline, keyed by an immutable per-object slug.** Each custom object
   gets a stable slug (`ObjectDefinition.ObjectKey`, e.g. `vendor`), generated once at creation and
   never changed on rename. Custom-object `FieldDefinition` rows set `ObjectType = <slug>`, so the
   entire field machinery — add-field, the Fields tab, validation, the catalog read the export picker
   uses — works unchanged (a custom object is "just another object type"). The slug keeps the key
   readable in the DB/logs and avoids leaking a GUID if a UI label-map is ever missed; it survives
   renames like a GUID would. The narrow `FieldDefinition.ObjectType` CHECK is dropped (object-type
   validity is enforced in the app against `ObjectDefinition`, not a hard-coded list).

3. **System fields synthesize for custom objects too.** `FieldSchemaService` gains one addition:
   after the five built-ins it enumerates the workspace's custom objects and synthesizes the same five
   read-only system auto-fields (Record ID / Name / Date created / Last updated / Created by) for each,
   so a new custom object shows on the Fields tab with system fields **by default**.

## Data model

### `dbo.ObjectDefinition` — add a slug

Add `ObjectKey NVARCHAR(64) NOT NULL` — a lowercase slug derived from `Name` at create time
(`vendor`), with a short disambiguator when needed (`vendor-a1b2`) so it is unique per workspace.
**Immutable** once set (a rename changes `Name`/`PluralLabel`, never `ObjectKey`), so field rows and
record queries never re-point. Unique filtered index on `(WorkspaceId, ObjectKey) WHERE IsDeleted = 0`.
The slug is copied into `FieldDefinition.ObjectType` for the object's fields, which is only 16 chars
today and so must be widened — see "Width" below.

### `dbo.CustomRecords` — the generic record store

```
RecordId           UNIQUEIDENTIFIER  PK (NEWSEQUENTIALID)
ObjectDefinitionId UNIQUEIDENTIFIER  NOT NULL  FK → ObjectDefinition
WorkspaceId        UNIQUEIDENTIFIER  NOT NULL  FK → Workspaces
Name               NVARCHAR(400)     NOT NULL  -- the "name" system field (record display label)
FieldValues        NVARCHAR(MAX)     NOT NULL DEFAULT N'{}'  CHECK (ISJSON(FieldValues) = 1)
CreatedAt/UpdatedAt/CreatedBy/UpdatedBy/IsDeleted/DeletedAt   -- standard six audit columns
```

Indexes: NC on `ObjectDefinitionId`, on `WorkspaceId`; composite
`(WorkspaceId, ObjectDefinitionId, RecordId) WHERE IsDeleted = 0` for the list/query read. Identity
is the `RecordId` GUID (consistent with the Attachment export identity); a friendly per-object display
id is a later enhancement, not needed for SP1.

### `dbo.FieldDefinition` — allow custom object types

Drop `CK_FieldDefinition_ObjectType`. Custom-object field rows carry `ObjectType = <object slug>`,
`WorkspaceId = <owning ws>`. Everything else about `FieldDefinition` and `FieldSchemaService` is
unchanged. (The parallel narrow CHECK on `FieldRuleDependency.ObjectType` is out of scope — SP1 does
not add rules/dependencies to custom fields.)

### Width note (schema change owned here)

`FieldDefinition.ObjectType` is `NVARCHAR(16)` — too narrow for a slug longer than 16 chars. Widen it
to `NVARCHAR(64)` in this sub-project (it participates in the unique key `(WorkspaceId, ObjectType,
FieldKey)`; the ALTER + index rebuild is handled in the migration). Sibling `ObjectType` columns
(`Comments`, `Attachments`, `AuditEntry`, `SavedView`, …) are **not** widened here — they only matter
when a custom record needs a comment/attachment/saved-view, which are out of scope for SP1 and handled
by their own sub-projects when they arrive.

## API surface

New `ICustomRecordsService` + `CustomRecordsController`, mirroring `RequestsService`/`RequestsController`
conventions (controllers do request/response only; logic in the service; procs for data). All routes
workspace-membership-gated via `IAccessGuard`.

| Verb + route | Purpose | Gate |
|---|---|---|
| `POST /workspaces/{ws}/objects/{objectId}/records` | Create a record | Member+ |
| `GET  /workspaces/{ws}/objects/{objectId}/records` | Query (paginated `{page,pageSize,filters}`) | Viewer+ |
| `GET  /workspaces/{ws}/objects/{objectId}/records/{recordId}` | Detail (all field values) | Viewer+ |
| `PATCH /workspaces/{ws}/objects/{objectId}/records/{recordId}` | Update (If-Match ETag) | Member+ |
| `DELETE /workspaces/{ws}/objects/{objectId}/records/{recordId}` | Soft delete | Member+ |

- `objectId` is validated to be an existing custom `ObjectDefinition` in `{ws}` → else `404`. A record
  whose `ObjectDefinitionId`/`WorkspaceId` doesn't match the route → `404` (never disclose).
- **Validation (v1, deliberately light):** required-field presence against the object's field schema
  (fields marked `IsRequired`); unknown keys in the submitted `FieldValues` are dropped (not an error).
  Type/range/select-option validation is deferred — flagged as a follow-up, not built here.
- Access model reuses workspace membership exactly as Requests do; no record-level access in SP1.

### Stored procs

`usp_CreateCustomRecord`, `usp_GetCustomRecordById`, `usp_QueryCustomRecords` (paginated, by object),
`usp_PatchCustomRecord`, `usp_DeleteCustomRecord`. Standard boilerplate (`SET NOCOUNT/XACT_ABORT ON`,
`TRY…CATCH` on writes, soft-delete exclusion). The record-count that `ObjectSchemaService.MapCustom`
currently hard-codes to 0 is switched to a live `COUNT` from `CustomRecords` (and `FieldsCount` to the
live `FieldDefinition` count for the slug) so the Objects tab shows real numbers.

## Out of scope for SP1 (later sub-projects / follow-ups)
Record list/detail/create/edit **UI**; the add-field **UI** targeting a custom object (the API/Fields
tab already allow it — the dedicated UI affordance is SP3); import/export (SP5); rich field validation;
per-record access control; comments/attachments/saved-views/relationships on custom records; a friendly
per-object display id.

## Testing
- **tSQLt:** each proc — happy path, NULL/empty inputs, soft-delete exclusion, workspace/object
  scoping (a record of another object or workspace is not returned), pagination.
- **xUnit:** `CustomRecordsService` — happy path, not-found (`404`, never disclose), ownership/scope,
  required-field validation flag, cancellation; ≥1 integration test for the full create→get→patch→
  delete→list cycle. `ObjectSchemaService` count change covered. `FieldSchemaService` custom-object
  system-field synthesis covered (pure `BuildCatalogRows` extension stays unit-testable).

## Slice sizing
This is one coherent capability but a large diff (new table + 5 procs + service + controller + two
schema alters + `FieldSchemaService`/`ObjectSchemaService` changes + tests). At planning time it may
split into **1a) storage & schema** (table, slug, CHECK drop, width, system-field synthesis, counts)
and **1b) record CRUD API** (service, controller, procs) if it exceeds the reviewable ceiling. It
specs as one capability; the plan decides.

## Open questions
1. **Slug on existing custom objects.** If any custom objects already exist without an `ObjectKey`, the
   migration backfills a slug from `Name`. (In the seeded dev DB there are none, so this is a safety
   backfill only.)
2. **Global custom objects.** `ObjectDefinition.Location` allows `Global`. SP1 scopes records + fields
   to the owning workspace; a `Global` custom object's records being visible cross-workspace is treated
   as out of scope (records are workspace-scoped) unless we decide otherwise before build.
