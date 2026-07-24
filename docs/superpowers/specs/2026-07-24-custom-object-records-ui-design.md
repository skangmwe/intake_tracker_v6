# Custom-object records — CRUD UI, rich list & detail (design)

**Date:** 2026-07-24
**Status:** Draft (for review)
**Program:** "Custom objects become first-class" — give admin-created custom objects real records,
fields, in-app CRUD, and CSV import/export. This spec is **Sub-project 2** of the program; it merges
the originally-separate SP2 ("record CRUD UI") and SP4 ("record list/detail UI") into one
full-featured sub-project. It builds directly on the SP1 backend foundation
(`2026-07-24-custom-object-records-foundation-design.md`), which is shipped (slices 1a + 1b).

## Problem

SP1 gave custom objects a real record store (`dbo.CustomRecords`), a fields pipeline keyed by the
immutable per-object slug (`ObjectDefinition.ObjectKey`), and a full record-CRUD API
(`/api/v1/workspaces/{ws}/objects/{objectId}/records` — create/query/get/patch/delete). But there is
**no UI**: an admin can create a custom object and (via the API) give it fields and records, yet the
app surfaces none of it. Custom-object records cannot be browsed, created, edited, or deleted from the
product. SP2 builds that UI, at parity with how the built-in **Requests** surface works: a paginated
records list with server-side filters, sortable columns, and per-object saved views; a create form; a
full-page detail with inline-editable fields; and delete.

## Goal (SP2)

For **any custom object**, a workspace member can, entirely in the app:

- **Browse** its records in a paginated list with per-column filters, sortable headers, and per-object
  saved views (Requests parity).
- **Create** a record via a form driven by the object's field schema.
- **Open** a record's detail page and **edit** its field values inline (autosave).
- **Delete** a record (soft delete).

All surfaces are styled to match the Requests surfaces and reuse the existing shared components
(`TableShell`, `FilterFunnel`, `ViewBar`, `SavedViewPicker`, `SavedViewEditor`, the shared Form
controls). The UI consumes the SP1 (slice 1b) records API unchanged except for the small, necessary
backend additions in Part 1 below.

## Non-goals / out of scope (later sub-projects or follow-ups)

Custom records have no backend for these in SP1, so SP2 does not build them: relationships, activity
feed, attachments, comments on records; lifecycle stages / stepper; a friendly per-object display id.
Also out of scope: dynamic **sidebar nav** links for `showInSidebar` custom objects (touches shared
Layout/nav wiring — a clean separate follow-up; SP2's entry point is the Objects admin tab only); CSV
import/export (SP5); rich per-field validation beyond required-presence (already the SP1 rule); and
optimistic-concurrency on record edits (SP1's PATCH is last-write-wins by design).

---

## Part 1 — Backend changes

Three additions plus one trivial one. Two are small and precedented; one (C) is the real work.

### A. Expose the field schema for custom objects

The forms and the list's column/filter configuration need a custom object's field schema.
`GET /api/v1/workspaces/{ws}/fields?objectType=<type>` currently rejects a custom slug — its
`IsValidObjectType` check only admits the five built-ins (`Request/Task/Feature/ToolkitItem/
Attachment`) and returns **400** for anything else — even though `FieldSchemaService.GetSchemaAsync`
already works for any object type including a custom slug.

**Change:** widen the controller's object-type validation so a slug that resolves to an existing
custom `ObjectDefinition` in the workspace is accepted (else **404**, never disclose). No new endpoint,
no DTO change — the response is the existing `WorkspaceFieldSchemaDto` (`fields: FieldDefinitionDto[]`,
each carrying `fieldKey`, `displayName`, `fieldType`, `isRequired`, `section`, `sortOrder`,
`options: SelectOptionDto[]`, etc.). The list and both forms consume it via the existing
`fetchWorkspaceFields(workspaceId, objectType)`.

### B. Generalize saved views to custom objects

The saved-views subsystem — `dbo.SavedView`, its procs (`usp_UpsertSavedView`, `usp_ListSavedViews`,
`usp_GetSavedViewById`, `usp_DeleteSavedView`), `SavedViewsService`, `SavedViewsController`, and the
entire `web/src/features/saved-views` frontend feature (`SavedViewPicker`, `SavedViewEditor`, hooks) —
is **already generic over `objectType`**. It needs no logic change to serve a custom object; the list
page just passes `objectType={slug}`. The only blocker is that `objectType` is a **closed enum at
three layers**, and the column is too narrow for a slug:

- `SavedView.ObjectType` is `NVARCHAR(16)` — widen to `NVARCHAR(64)` (slugs are up to 64 chars).
- `CK_SavedView_ObjectType` restricts values to `Request|Feature|Task|Announcement` — **drop it**
  (object-type validity is app-enforced against `ObjectDefinition`, exactly as SP1 dropped
  `CK_FieldDefinition_ObjectType`).
- C# `SavedViewUpsertRequest.ObjectType` regex `^(Request|Feature|Task|Announcement)$` — relax to also
  admit a lowercase slug pattern (e.g. `^([a-z0-9-]{1,64})$` alongside the built-in names). Validity of
  a given slug is confirmed against `ObjectDefinition` in the service, not the regex.
- TS `SavedViewObjectType` union — broaden so a custom slug is a legal value (see Open question 1).

This mirrors the SP1 precedent precisely: widen the column, drop the CHECK, relax the app-layer
validators, keep validity app-enforced. `savedViewId` resolution stays **client-side** exactly as it is
for Requests (selecting a view copies its `filters`/`sort` into list state; the query proc never sees
`savedViewId`).

### C. Real filter/sort query over the JSON field bag (the hard part)

The SP1 slice-1b `usp_QueryCustomRecords` **ignores** `filters`, `sort`, and `savedViewId` — it only
paginates. SP2 replaces it with a query that filters and sorts over:

- **Stable columns:** `Name` (text contains), `Created`/`Updated` (date range + sort).
- **Every user field** of the object, with the filter/comparison behaviour derived from each field's
  `FieldType`:
  - `SingleSelect`/`MultiSelect` → select (`IN` over the field's value)
  - `ShortText`/`LongText`/`Url` → text `LIKE '%…%'`
  - `Number`/`Decimal`/`Currency`/`Percent` → numeric compare (`> >= = <= <`), numeric cast
  - `Date`/`DateTime` → range (`from`/`to`), datetime cast

Because user-field values live in the `FieldValues` JSON map (keyed by field key) rather than in
columns, the proc cannot be a fixed-column query like `usp_QueryRequests`. Instead:

- The proc reads the object's `FieldDefinition` rows to learn which keys exist and each key's type.
- It builds the JSON-path predicates and the `ORDER BY` via `sp_executesql`, where **every field key is
  whitelisted by joining to `FieldDefinition`** (only keys that exist for the object are ever emitted
  into a `JSON_VALUE(FieldValues, '$.<key>')` expression) and **every compared value is an
  `sp_executesql` parameter** (never concatenated). Type-aware casting is applied so numbers and dates
  sort and compare correctly (numeric/datetime, not lexical).
- Pagination + a `TotalCount` (second result set, matching the `usp_QueryRequests` shape) so the
  service can read page rows then `NextResult` for the count.

**Service marshalling** (`CustomRecordsService.QueryAsync`): reuse the `RequestsService` pattern —
`BuildFiltersJson(query.Filters)` marshals the wire `Dictionary<string, FilterClause>` into the proc's
JSON; `ResolveSort(query.Sort)` picks the sort column + direction. The `FilterClause`/`SortSpec` wire
contract is reused verbatim (`{kind:'text',contains}`, `{kind:'select',values}`,
`{kind:'number',op,value}`, `{kind:'date',from?,to?}`). Because the proc returns two result sets, the
service uses raw ADO.NET with `SqlParameter`s (as `RequestsService.QueryAsync` does); the plan pins the
exact mechanism.

**This is the designated high-risk review target.** Its review focus is (1) SQL-injection safety — no
field key reaches the SQL text unless it matched a real `FieldDefinition` row for the object, and all
values are parameters; and (2) correct type handling — numeric and date fields must compare and sort by
value, not lexically.

### D. Minor detail-DTO addition

The record detail's meta strip shows Created / Last updated; `CustomRecordDto` already carries
`createdAt`/`updatedAt`. Add `createdBy` (the `CustomRecords.CreatedBy` audit column) to
`usp_GetCustomRecordById`'s projection and to `CustomRecordDto` so the detail can show "Created by".
Trivial one-line-per-layer addition; improves the detail.

---

## Part 2 — Frontend

New feature module `web/src/features/custom-records/`, laid out as a vertical slice mirroring
`features/requests/`.

### Data layer

- `api.ts` — thin `apiFetch`/`withQuery` wrappers: `queryRecords`, `getRecord`, `createRecord`,
  `patchRecord`, `deleteRecord`. The records API keys on the object **GUID id**; the list page resolves
  `{id, name, pluralLabel}` from the cached workspace objects list (`useObjects`) by `objectKey`, so a
  route can carry the readable slug while calls use the id.
- `useCustomRecords.ts` — TanStack Query hooks + exported key factories
  (`customRecordsListKey(wsId, objectId, query)`, `customRecordKey(recordId)`), `enabled` guards,
  mutation invalidation (`invalidateQueries` on the list key prefix; `setQueryData` on the detail key).
- Add `RECORDS_PAGE_SIZE` to `web/src/shared/constants.ts` (per the named-constant rule; there is no
  shared `DEFAULT_PAGE_SIZE` today).

### Shared field-form extraction

Extract the dynamic field renderer (`features/requests/components/RequestFieldControl.tsx` → a generic
`FieldControl`) and the pure form helpers (`groupFieldsBySection`, `evaluateFieldConditions`, the
required-field validation from `requestForm.ts`) into a shared location consumed by **both** Requests
and custom records. This is a scoped extraction justified by the second consumer — move + generalize,
not a Requests rewrite; Requests is refactored to import from the shared location. (Fallback if churn is
undesirable: clone into `features/custom-records`; the extraction is recommended.)

### Surfaces (each roots a stable `data-ds`)

1. **`CustomRecordsListPage`** — route `/objects/:objectKey`. Clones `RequestsListPage`'s wiring:
   - `TableShell` with columns = `Name` + user fields (from schema, ordered by `sortOrder`);
     `FilterFunnel` per filterable column with the funnel `type` derived from the field's `FieldType`;
     sortable headers via `onSortChange`.
   - `ViewBar` (active-filter pills + clear-all + primary "New record") + `SavedViewPicker` +
     `SavedViewEditor`, all reused, passing `objectType={slug}` and `useSavedViews(wsId, slug)`.
   - `TableFooter` pagination (server-side, `PaginatedResponse`).
   - The query is a `PaginatedQuery` `{page, pageSize, filters?, sort?}` POSTed to `/records/query`.
   - Explicit **loading / error / empty (zero-data) / filtered-to-zero** states via `EdgeStates`.
   - Row kebab (View / Edit / Delete) via the portaled `RowActionsMenu` pattern; row-click → detail.
2. **`CustomRecordCreatePage`** — route `/objects/:objectKey/new`. `IntakeFormPage`-style form: a Name
   field + user fields grouped by section via the shared `FieldControl`; client-side required-field
   validation surfaced on submit (server re-validates per SP1); `POST` → navigate to the new record's
   detail. Handles the zero-user-fields object gracefully (Name only).
3. **`CustomRecordDetailPage`** — route `/objects/:objectKey/:recordId`. Layout: breadcrumb → header
   (name, id, Delete action) → meta strip (Created / Last updated / Created by) → a single fields panel
   showing all values grouped by section, **inline-editable with debounced autosave** (`PATCH`, full
   field-map replace; no `If-Match` — SP1 is last-write-wins) with an "All changes saved" `aria-live`
   indicator. No stepper, no empty tabs. `403` → `NoAccessPage` (non-disclosure).

### Routing & entry

- Register the three routes as siblings in `web/src/App.tsx` and add them to `IMPLEMENTED_ROUTES` so
  they don't fall through to `PlaceholderPage`; import the feature CSS in the App.tsx block.
- Wire the **Objects admin tab** (`features/objects/components/ObjectsTable.tsx`) so a custom object row
  exposes a **"View records"** affordance → `navigate('/objects/' + object.objectKey)`. The existing
  editor sheet stays the "edit definition" path. Built-in objects get no records route.

---

## Part 3 — Slicing

One coherent sub-project, but a large diff that exceeds the reviewable ceiling as a single slice.
Proposed decomposition (the plan finalizes grain per `slicing.md`):

- **Slice A — backend foundation.** Part 1 A (field-schema endpoint widening) + B (saved-view
  generalization: migration widening `ObjectType`, dropping the CHECK; C# regex + TS enum relax) +
  C (JSON-field query proc rewrite + `CustomRecordsService.QueryAsync` marshalling) + D (detail-DTO
  `createdBy`), with all backend tests. Delivers "custom records are queryable/filterable/sortable,
  their schema is fetchable, saved views accept their slug" — provable end-to-end via tests. If C
  balloons past the ceiling, the plan splits it from the trivial A/B/D relaxes.
- **Slice B — browse surface.** The records list page (TableShell + FilterFunnel + sortable headers +
  ViewBar + SavedViewPicker + SavedViewEditor reused with `objectType={slug}`), `api.ts` + hooks, the
  list route, and the Objects-tab "View records" entry. A demoable read/filter/save-views capability.
- **Slice C — mutate surface.** The shared `FieldControl` + form-helper extraction, create page, detail
  page with inline autosave, delete, and their routes. Independent create/edit/delete capability.

Slices B and C are independently rollable; Slice A is the shared foundation both build on.

## Testing

- **tSQLt** — the new query proc: happy path, each filter family (select / text / number / date), sort
  direction + numeric-vs-lexical correctness, pagination + `TotalCount`, workspace/object scoping
  (records of another object or workspace are excluded), soft-delete exclusion, NULL/empty inputs.
- **xUnit** — `CustomRecordsService.QueryAsync` (filter-JSON marshalling, sort resolve, page clamp,
  403 vs 404, cancellation); `FieldsController` object-type widening (custom slug → 200, unknown slug →
  404); the `createdBy` projection; ≥1 integration test for the query cycle.
- **Frontend** — jest + jest-axe per component across each meaningful state (loading / error /
  zero-data / filtered-to-zero, required-validation, autosave-saved); Playwright e2e for **browse +
  filter + saved-view** and **create → edit → delete**.

## Build-time notes for the plan (not decisions)

1. **Migration number.** Re-verify the next migration number against `origin/dev` before writing it —
   SP1 hit an 079→080 collision under concurrent shipping. Confirm against `origin/dev`, not memory.
2. **High-risk review target.** Slice A's JSON query proc is the designated injection-safety review
   focus: field keys whitelisted by joining to `FieldDefinition`, all values parameterized, type-aware
   casts for numeric/date compare + sort.
3. **`FieldControl` extraction** touches `features/requests`; keep it a move + generalize (Requests
   re-imports), not a behavioural change to Requests.

## Open questions

1. **Saved-view `objectType` type in TS.** Broadening `SavedViewObjectType` to admit an arbitrary slug
   (`string`) loosens type-safety for the existing built-in surfaces. The plan decides whether to widen
   the union to `string` or introduce a separate custom-record saved-view type alias; low-risk either
   way.
2. **Which user fields are filterable/sortable by default.** SP2 defaults to *all* user fields being
   both filterable and sortable (subject to type). If a field type has no sensible filter/sort (e.g.
   a `Calculation`/derived read-only field), the plan excludes it from the funnel/sort set.
