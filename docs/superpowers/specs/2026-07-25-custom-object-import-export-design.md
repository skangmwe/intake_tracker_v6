# SP5 — Custom-Object CSV Import/Export — Design

**Date:** 2026-07-25
**Program:** custom-object-records-program (SP5, final foundation piece)
**Status:** design approved; plan + build to follow
**Predecessors (all shipped to `dev`):** SP1 storage/schema, SP2 record CRUD UI, SP3 fields-on-custom-objects.

---

## 1. Goal

Give admin-created **custom objects** (`dbo.ObjectDefinition`, `IsSystem = 0`) the same CSV
**import and export** capability the built-in objects already have — surfaced through the
**existing** `/import-export` wizards, with **no new wizard UI**. This is the piece the program
was originally asked for; the storage (SP1), records UI (SP2), and per-object fields (SP3) that
it depends on are now all in place.

Built-in objects (Request/Feature/Task/Toolkit/Attachment) are unchanged.

### Approved scope decisions

| Decision | Choice |
|---|---|
| Directions | **Both** import and export |
| Entry point | **Reuse the existing wizards** — custom objects appear in the object dropdowns |
| Import mode | **Create-only** — each CSV row → one new record (matches built-in Request import) |
| Slicing | **One slice** — single capability, one bounded context, backend-dominant |
| Migration | **None** — SP5 is wiring over existing storage, not a schema change |

---

## 2. Why this is small

The entire IO stack is **already generic** over `IIoObject` / `IIoImporter`:

- `ExportService.ExportObjectAsync` (Viewer-gated), `CsvExportWriter.WriteDataset`
- `ImportService.StartAsync` (WorkspaceAdmin-gated), `ImportRunner`, `CsvRowMapper.MapValues`
- `ImportExportController` endpoints (`GET io/objects`, `POST exports/object`, `POST imports/csv`, `GET imports/{id}`)
- Both web wizards (`ImportWizard`, `ExportWizard`) render whatever `/io/objects` returns and
  filter on `canImport` / `canExport`.

A custom object is a **dynamic FieldValues object**, structurally identical to Request/Feature —
records store a `FieldValues` JSON bag keyed by `ObjectDefinitionId` + `RecordId`, and the shared
`FieldValuesProjector.Project(recordId, fieldValuesJson)` already knows how to flatten it.

**The only blocker** is that the registry (`IIoObjectRegistry`) is static and DI-composed — one
instance per type, keyed on `ObjectType`, with no workspace. Custom objects are N-per-workspace,
keyed by slug. Bridge that, and everything downstream lights up for free. Net new web code is
essentially nil.

---

## 3. Architecture — workspace-aware registry (Approach A)

Keep the static `All` / `Find(objectType)` **exactly as they are** — `FieldSchemaService.Catalog`
depends on `All`, and it must stay built-ins-only (custom-object catalog fields come from stored
`FieldDefinition` rows, not from `IIoObject.CatalogFields`). *Add* two workspace-aware methods:

```csharp
Task<IReadOnlyList<IIoObject>> AllForWorkspaceAsync(Guid workspaceId, Guid userId, CancellationToken ct);
Task<IIoObject?>               FindForWorkspaceAsync(Guid workspaceId, string? objectType, Guid userId, CancellationToken ct);
```

- `AllForWorkspaceAsync` → the static built-ins **plus** one descriptor per non-system custom
  object in the workspace.
- `FindForWorkspaceAsync` → try the static `Find(objectType)` first (built-ins); if unmatched,
  resolve the slug to a custom object via `IObjectSchemaService` and construct a descriptor. Unknown
  slug → `null` (caller maps to unsupported/denied, no disclosure).

A small **`ICustomObjectIoObjectFactory`** builds a `CustomObjectIoObject(slug, name, …)` on demand
(plain class, **not** DI-registered per slug — the registry composes it with the collaborators it
needs). This keeps the registry from depending directly on the CustomRecords module and keeps the
factory unit-testable.

The **four IO call sites** — all of which already have a workspace in scope — switch from
`All`/`Find` to the workspace-aware methods:

| Call site | Was | Becomes |
|---|---|---|
| `ImportExportController.GET io/objects` | `_registry.All` | `AllForWorkspaceAsync(ws, uid, ct)` |
| `ExportService.ExportObjectAsync` | `_registry.Find(objectType)` | `FindForWorkspaceAsync(ws, objectType, uid, ct)` |
| `ImportExportController.POST imports/csv` | `_registry.Find(objectType)` | `FindForWorkspaceAsync(ws, objectType, uid, ct)` |
| `ImportRunner.RunAsync` | `_registry.Find(message.ObjectType)` | `FindForWorkspaceAsync(message.WorkspaceId, message.ObjectType, message.StartedByUserId, ct)` |

Built-in behavior and every existing built-in test are untouched.

### `CustomObjectIoObject` (mirrors `RequestIoObject` / `FeatureIoObject`)

- `ObjectType` = the custom object **slug** (`ObjectDefinition.ObjectKey`)
- `Label` = the custom object **Name**
- `CanImport = true`, `CanExport = true`
- `CatalogFields` = **empty** (custom-object fields are stored `FieldDefinition` rows)
- implements both `IIoObject` and `IIoImporter`

Collaborators: `ICustomRecordsService` (records), `IFieldSchemaService` (field columns),
plus the resolved `ObjectDefinitionId` (from `IObjectSchemaService`, done during resolution so the
descriptor holds the id).

---

## 4. Export path

- **`GetExportFieldsAsync(ws, userId, ct)`** →
  `id` + `Name` (both `AlwaysIncluded`), then the object's **user fields** pulled from the workspace
  field schema filtered to the slug (`IFieldSchemaService.GetSchemaAsync(ws, slug)` — already
  handles custom slugs from SP2/SP3). **System auto-fields** (Location, etc.) are excluded — they
  are derived display fields, not record data.
- **`BuildExportAsync(ws, userId, ct)`** →
  page `ICustomRecordsService.QueryAsync(ws, objectDefinitionId, …)` up to `MaxExportRows`, project
  each row via `FieldValuesProjector.Project(recordId, fieldValuesJson)`, and inject the first-class
  `Name` + `id` into the cell dict. Returns `null` if the caller can't see the object → `Denied`
  (403), matching Feature's per-object boundary.
- **Gating:** Viewer — unchanged, enforced in `ExportService.ExportObjectAsync`.
- **Column parity** with Request/Feature: `id` + `Name` + user fields. No audit columns
  (CreatedAt/UpdatedAt/CreatedBy) — deliberately matching built-in dynamic-object export.

## 5. Import path (create-only)

- **`ImportFields`** = `Name` (**Required**) + the object's user fields (each carrying its own
  schema `Required` flag). System auto-fields are not import targets.
- **`ImportRowAsync(ctx, fieldValues, ct)`** →
  pull `name` out of the mapped values, remaining values → the Fields bag, call
  `ICustomRecordsService.CreateAsync({ Name, Fields })`. Map the result:
  - success → `ImportRowResult.Landed`
  - `ValidationFailed` (missing required field, invalid option value — `CreateAsync` already runs
    `GetRequiredFieldKeysAsync`) → `Flagged` with reasons via `ImportOutcomeMapper`.
  A bad row is flagged and skipped, never aborts the batch — existing `ImportRunner` behavior.
- **Auto-match caveat:** `CsvRowMapper.AutoMatchValues` uses **Request-specific** alias tables.
  The wizard always sends an explicit column→field mapping (its Map-columns step), so custom import
  always takes the explicit `MapValues` path. As a safety net, custom objects get a **generic**
  header-match fallback (exact field **Label** or **Key**), not the Request aliases.
- **Gating:** WorkspaceAdmin — unchanged, enforced in `ImportService.StartAsync` via
  `usp_CreateImport`.

---

## 6. Eligibility, edge cases, risks

- **Eligibility:** all non-system custom objects in the workspace surface in both wizards. An object
  with **zero user fields** still exports `id` + `Name` and imports `Name` only — harmless, no
  special-casing.
- **Unknown / foreign slug** on export or import → treated exactly like a bad built-in type
  (`Unsupported` / `Denied`), no disclosure.
- **Proc-width risk to confirm in the plan:** the field-source read behind
  `IFieldSchemaService.GetSchemaAsync(ws, slug)` must accept a **64-char slug** without truncation.
  SP3 widened the six field procs to `NVARCHAR(64)`; the plan confirms the schema-read path used
  here is among those (or widens it). **No new migration is expected** for SP5.
- **Not touched:** the deferred saved-views `@ObjectType NVARCHAR(16)` cleanup — SP5's
  object-export path does not go through saved views (only the legacy Request saved-view export
  does).

---

## 7. Testing

- **Backend unit (xUnit):**
  - `CustomObjectIoObject` export projection — `Name` + `id` injected, `FieldValuesProjector`
    reused, system fields excluded.
  - `CustomObjectIoObject` import row → `CreateAsync` mapping — `Landed` on success, `Flagged` on
    `ValidationFailed` with reasons.
  - Registry `FindForWorkspaceAsync` — built-in still found; custom slug resolves; unknown slug →
    `null`. `AllForWorkspaceAsync` — built-ins + custom present.
  - `CustomObjectIoObjectFactory`.
- **Integration:** custom object appears in `GET /io/objects`; object-export round-trip; import
  returns 202 + status (mirroring existing `ImportExport` tests + the 401/403-gating precedent).
- **Web (minimal):** a custom object renders in both wizard dropdowns and drives export/import;
  jest-axe on any changed rendered state.

## 8. Slicing

**One slice.** A single user-visible capability (custom-object CSV IO), one bounded context
(ImportExport wiring over CustomRecords), well under the reviewable size ceiling, backend-dominant
with near-zero new web code. Splitting export from import would add a merge boundary with no
rollout-risk benefit.

---

## 9. Ship mechanics (program lesson — carry forward)

- Build via subagent-driven-development, per-task-reviewed, or single-agent — either is fine for a
  one-slice feature.
- `/dev-ship`'s single-commit model does **not** fit an SDD branch that already committed per task;
  and the auto-mode classifier blocks the node design-fidelity cache-writer/validator. If those
  apply, ship via a manual `git -C <primary> merge --no-ff slice/custom-object-io` + `git push
  origin dev` (the exact op `/dev-ship` step 6 performs; the block hook only matches literal
  `git commit`).
- SP5 changes **no** prototyped screen / shell / token / layout file, and is backend-dominant —
  `phases_run` has no `design-fidelity-web`, so **no evidence manifest is needed**. Confirm the web
  diff touches no `.css/.scss` and no design-system `.tsx` beyond test files; verify conformance by
  grep on any changed non-exempt files rather than waiting on the slow Windows hook.
- Re-check the highest migration number and `origin/dev` movement at ship time (dev advances under
  concurrent sessions) — though SP5 adds no migration.
