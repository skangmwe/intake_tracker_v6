# Import & Export — Tabs + Wizards (S28 redesign)

**Date:** 2026-07-21
**Status:** Approved design, pre-implementation
**Screen:** S28 Import & export (WorkspaceAdmin surface)

## Problem

The current Import & Export page (`web/src/features/import-export/`) shows two side-by-side
panels:

- **Import** — upload a CSV; the server auto-maps columns by header name (`CsvRowMapper`) and
  creates **Requests only** (create-only). Async job + polling + flagged-row report. No column
  mapping UI, no object choice.
- **Export** — pick a **saved view**, download CSV. Columns follow the view. **Request object
  only.**

We want to:

1. Split the page into an **Import tab** and an **Export tab**.
2. Give Import a **wizard** that is CSV-only and lets the user **map CSV columns to fields**.
3. Give Export a **wizard** where the user **picks an object, then picks which fields** to export
   — with mandatory identity fields (Request → Request ID; Task → Task ID + Request ID; etc.).

Decisions taken at intake (all the ambitious options):

- Export field-picker **coexists** with the existing saved-view export ("keep both").
- Export covers **every object with data**.
- Import becomes **multi-object**.
- **Full-stack, sliced** — real API contracts, DB/procs where needed, tests, shipped via the
  normal `/dev` pipeline.

## Object-support reality

The five built-in objects are **not** equal. Building all five as if they were would be
dishonest, so the design lights objects up by feasibility using a generic engine.

| Object          | Field schema | Workspace-wide query      | Create               | Export        | Import (CSV create) |
| --------------- | ------------ | ------------------------- | -------------------- | ------------- | ------------------- |
| **Request**     | full         | `IRequestsService.QueryAsync` | `CreateAsync`    | reuse         | reuse               |
| **Feature**     | full         | `IFeaturesService.QueryAsync` | `CreateAsync`    | yes           | yes                 |
| **Task**        | full         | **none** (per-record only)| `CreateAsync` (needs parent request) | needs new workspace query | each row resolves a parent Request ID |
| **Toolkit item**| auto-fields  | `IToolkitService.QueryAsync`  | `CreateAsync` (has file content) | metadata only | **no** (create needs a file) |
| **Attachment**  | auto-fields  | file object               | file object          | metadata only | **no** (it is a file) |

Consequences baked into the design:

- **Import** lists only genuinely create-from-a-row objects: **Request, Feature, Task**. Toolkit
  and Attachment never appear in the Import object picker.
- **Export** lists all objects that expose rows: **Request, Feature, Toolkit, Task**, plus
  **Attachment** as metadata-only.
- Field lists for every object (both flows) come from the existing
  `FieldSchemaService.GetSchemaAsync(workspaceId, objectType)` — no new field storage.

## UI design

### Page shell

`ImportExportPage` keeps its WorkspaceAdmin courtesy gate (the API is the real boundary) and its
loading / error / not-admin states. Below the title it renders the shared `Tabs`
(`shared/components/Feedback/Tabs`) with two tabs: **Import** | **Export**. Each tab owns a wizard
driven by the shared `Stepper` (`shared/components/Feedback/Stepper`).

### Import wizard (Stepper)

1. **Object** — choose target object (Request / Feature / Task).
2. **Upload** — CSV-only. Validate type + size up front (mirror `ImportExportOptions`
   allowlist + `MaxFileBytes`). Parse the header row and preview the first ~10 rows client-side
   (parsing library TBD in plan — must be dependency-security reviewed; prefer a small,
   well-maintained CSV parser or a hand-rolled RFC-4180 reader for the preview only).
3. **Map columns** — a table: each CSV column → a `<select>` of the object's fields (from
   `GetSchemaAsync`), plus "— Don't import —". Pre-fill by case-insensitive name match (the current
   server auto-match becomes the default *suggestion*, now visible and overridable). Required
   fields are called out; an unmapped required field blocks **Next**. Duplicate mappings (two
   columns → one field) are blocked.
4. **Review & run** — summary (object, row count, resolved mapping). Submit hands the file +
   `objectType` + mapping to the server. The existing async job + `useImportStatus` polling +
   flagged-row report render unchanged.

### Export wizard (Stepper)

1. **Object** — choose object.
2. **Fields** — checklist of the object's fields from `FieldSchemaService`. Mandatory identity
   fields are pre-checked and **locked**: Request → Request ID; Task → Task ID + Request ID;
   Feature → Feature ID; Toolkit → Toolkit ID; Attachment → Attachment ID + parent ref.
3. **Download** — build a CSV of the chosen fields across rows the caller may already see, then
   download it.

The existing **saved-view export is retained** ("keep both") as a second entry point on the Export
tab, below the wizard: "Export a saved view" — the current `ExportPanel` content.

## Backend design

### Object registry

A small registry maps `objectType` → descriptor:

```
ObjectExportDescriptor {
  key: string,                       // "Request" | "Feature" | "Task" | "Toolkit item" | "Attachment"
  identityFieldKeys: string[],       // locked, always-included columns
  rowProvider(workspaceId, fieldKeys, userId, ct) -> IReadOnlyList<row>   // reuses the object's access-filtered query
}
ObjectImportDescriptor {
  key: string,                       // "Request" | "Feature" | "Task"
  createFromRow(workspaceId, mappedFields, actorUserId, ct) -> WriteResult // per-object create path
  requiredFieldKeys: string[]
}
```

Registration is DI-composed; each object's descriptor lives with (or beside) its module. The
registry is the single extension point — later slices add descriptors, not new endpoints.

### Endpoints

- **Export (new)** — `POST /v1/workspaces/{workspaceId}/exports/object`
  body `{ objectType, fieldKeys[] }` → `200 text/csv` (UTF-8 BOM, neutral filename).
  Validates: **Viewer+** on the workspace (export never widens access; match the saved-view
  export's Viewer gate). Unknown object → 400. Unknown field key → 400.
  Rows come from the descriptor's `rowProvider`, already access-filtered.
- **Export (unchanged)** — `POST /v1/exports` (saved-view) stays as-is.
- **Import (changed)** — `POST /v1/workspaces/{workspaceId}/imports/csv` gains two form fields:
  `objectType` and `mapping` (JSON: array of `{ columnIndex, fieldKey }`). Backward-compat: if
  `objectType`/`mapping` are absent, default to `Request` + header auto-match (preserves the
  current behavior and existing tests). `ImportRunner` applies the mapping instead of
  `CsvRowMapper` header matching and dispatches to the object's `createFromRow`.
- **Import status (unchanged)** — `GET /v1/imports/{importId}`.

### Task workspace-wide query (Slice 3)

Task export needs a workspace-wide task list (today only `GetTasksAsync(recordId)` exists). Add
`ITasksService.QueryForExportAsync(workspaceId, ...)` (or a new stored proc) returning task rows
with their parent Request ID. Task **import** resolves each row's parent Request ID against the
workspace; unresolved parent → the row is flagged and skipped (same non-silent pattern as the
existing Requestor fallback), never aborting the batch.

### Rules honored

- Import stays **create-only** (never updates a live record) — BS §13.
- Export **never widens access** — rows follow the caller's entitlements — BS §22.4.
- CSV values / file names are Confidential/PII — never logged; only ids + row indices in logs
  (`api-pii-handling.md`).
- Long-running import work stays off the request thread (existing `ImportProcessor`) —
  `api-performance.md`.
- Ownership/forbidden → **403 never 404** — BS §22.6.

## Slice plan

Each slice ships independently via `/dev-ship` and is self-contained (one user-visible capability).

- **Slice 1 — Shell + Request end-to-end.**
  Page → tabs; Import wizard (object/upload/map/review) and Export wizard (object/fields/download)
  wired for **Request only**; object registry introduced with the Request descriptor; saved-view
  export retained; import backward-compat default preserved. Full stack + tests (web unit + axe per
  state, API unit + integration, any new proc + tSQLt).
- **Slice 2 — Feature.**
  Register Feature export + import descriptors (query + create already exist). Both wizards list
  Feature. Tests.
- **Slice 3 — Task.**
  New workspace-wide task query for export; parent-Request resolution for Task import (flag on
  unresolved). Both wizards list Task. Tests.
- **Slice 4 — Toolkit + Attachment export.**
  Metadata-only export descriptors for Toolkit and Attachment; registry finalized. Export wizard
  lists all objects. Tests.

## Implementation considerations (not blocking design)

- **Design-fidelity gate:** S28 has a Claude Design prototype. Tabs + wizards diverge from it, so
  the automated fidelity render/compare will flag drift. The user's explicit request overrides the
  prototype (per `rules/design/README.md` precedence). Handle at ship time via this project's
  established waived-manifest pattern for prototype-overriding changes.
- **CSV client-side parse dependency:** the preview step needs to parse CSV in the browser. Any new
  npm dependency must pass `web-dependency-security.md` (no High/Critical). Prefer a tiny
  well-maintained parser or a scoped hand-rolled RFC-4180 reader used for preview only; the
  authoritative parse still happens server-side via CsvHelper.
- **Constants:** wizard limits (preview row count, poll interval already exists) go in
  `shared/constants.ts`; no magic numbers.

## Out of scope

- Import **update** (upsert) of existing records — remains create-only.
- Import of Toolkit (file content) and Attachment (files) — not CSV-shaped.
- Scheduled/recurring exports, saved export presets — not requested.
- Export beyond the caller's access — never.
