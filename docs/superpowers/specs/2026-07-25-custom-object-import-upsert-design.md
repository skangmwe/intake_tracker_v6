# Custom-Object Import Upsert (Create-or-Update) — Design

**Date:** 2026-07-25
**Program:** custom-object-records-program (follow-on to SP5 CSV import/export)
**Status:** design approved; plan + build to follow
**Builds on (shipped to `dev`):** SP5 custom-object CSV import/export (create-only), merge `7c791c3`.

---

## 1. Goal

Extend the just-shipped custom-object CSV import with an **"update existing records"** mode
(upsert). Today every imported row creates a new record. With upsert on, a row whose **Record ID**
matches an existing record **updates** that record (merging), and a row with no id **creates** a new
one — the classic export → edit in Excel → re-import round-trip.

Built-in objects (Request/Feature/Task/Toolkit/Attachment) stay create-only.

### Approved scope decisions

| Decision | Choice |
|---|---|
| Match key | **Record ID only** (server-generated GUID; guaranteed unique → no ambiguous match) |
| No-match (blank id) | **Create** a new record |
| Dead id (present but not found here) | **Flag** the row (don't silently create under a fresh id) |
| Merge semantics | **Merge** — only the CSV's mapped columns are written; unmapped fields keep their current values; Name updated only if mapped |
| Applies to | **Custom objects only** |
| Reporting | Show **created / updated / flagged** counts explicitly |
| Migration | **One** — two integer columns on the import record (`CreatedRows`, `UpdatedRows`) |

**Why Record ID (not Name / a field):** IDs are unique, so matching is unambiguous — never a
2+-match to resolve, no field-key whitelisting, no per-object "which field is the key" picker. The
match is a simple by-id lookup.

---

## 2. Behavior (the wizard flow)

The Import wizard gains an **import mode**, shown only for objects that support upsert (custom
objects): **Create only** (SP5 behavior) vs **Create or update**.

In **Create or update** mode, the Map-columns step requires the user to map their `id` column to a
reserved **"Record ID"** target (used only to find the record — the id is never written). Then per
row:

- **id present and found** → **update** the record, **merging**: `{...existing fields, ...CSV mapped
  fields}`; Name updated only if the CSV maps it. Counts as **Updated**.
- **id blank / absent** → **create** a new record (adds brand-new rows to an edited export). Counts
  as **Created**.
- **id present but not a valid GUID** → **flag** the row (invalid id).
- **id present, valid, but no such record here** (stale / another workspace / deleted) → **flag**
  the row (dead id) — providing an id means "this specific record"; silently creating under a fresh
  id would be surprising.

Because IDs are unique there is **no multi-match case**. The run report shows **"X created ·
Y updated · Z flagged."**

---

## 3. Architecture

Reuses SP5/SP2 building blocks — the merge is done in C# (load existing record, overlay CSV fields,
`PatchAsync` the merged map). **No record-side proc or schema change**; the only migration is the
two report-count columns.

### Backend

- **Capability flag** — add `bool CanUpsert { get; }` to `IIoObject` (alongside `CanImport` /
  `CanExport`): `false` for the five built-ins, `true` for `CustomObjectIoObject`. Surfaces on
  `IoObjectDto.canUpsert` so the wizard knows when to offer the mode.
- **Import mode** — a `Create | Upsert` enum flows form → `ImportService.StartAsync` →
  `ImportJobMessage` → `ImportRowContext.Mode`. (Match key is always the record id, so nothing else
  needs threading.)
- **The `id` mapping** — in upsert mode the wizard maps the id column to a reserved **"Record ID"**
  target (key `"id"`). The controller allows `"id"` as a valid mapping key **only in upsert mode**
  and **requires it mapped** (else 400); it also rejects upsert on a non-`CanUpsert` object (400).
  (`id` is already excluded from the written field bag by SP5's `_userFieldKeys`, so it is never
  stored as data.)
- **Descriptor branch** — `CustomObjectIoObject.ImportRowAsync` splits on `context.Mode`:
  - **Create** (unchanged SP5) → `CreateAsync`; result `Action = Created`.
  - **Upsert**: read `fieldValues["id"]`:
    - blank → `CreateAsync` (`Action = Created`),
    - not a GUID → `Flagged` ("invalid-id"),
    - `GetByIdAsync` returns null → `Flagged` ("record-not-found" / dead id),
    - found → merge `{...existing.Fields, ...mappedFields}`, Name = mapped Name ?? existing.Name →
      `PatchAsync`; on Success `Action = Updated`, on ValidationFailed → `Flagged`(FromValidationErrors),
      on NotFound (raced delete) → `Flagged`.
  Reuses existing `ICustomRecordsService.GetByIdAsync` + `PatchAsync` (Patch replaces the whole map;
  passing the pre-merged map achieves a field-level merge).
- **Action reporting** — `ImportRowResult` gains `ImportAction Action = ImportAction.None`. Only the
  upsert update path sets `Updated`; the runner treats a Landed row as **Updated** iff
  `Action == Updated`, else **Created** (so built-ins and create-only imports need no change and
  report Created = landed, Updated = 0). The runner tallies `created` / `updated` (alongside
  `flagged`) and passes them to `usp_CompleteImport`.

### Database (the one migration)

- **Migration ~097** (verify the next free number against `origin/dev` at build — dev is at 096) —
  add `CreatedRows INT NOT NULL DEFAULT 0` and `UpdatedRows INT NOT NULL DEFAULT 0` to the import
  record table, with an idempotent + rollback script.
- **`usp_CompleteImport`** — add `@CreatedRows` / `@UpdatedRows` params, write the two columns
  (`CREATE OR ALTER`, no migration file — procs are re-applied). Keep the existing `LandedRows` (=
  created + updated) for backward compatibility. tSQLt updated for the new params.

### API + Web

- **Status DTO** — `ImportStatusResponse` gains `createdRows` / `updatedRows`; the read proc /
  service surface them.
- **Web** — `ImportWizard` gains a **mode toggle** ("Create only" / "Create or update"), shown only
  when `active.canUpsert`. In upsert mode the column mapper offers the "Record ID" target and
  validation requires it mapped; the mode rides in the upload payload (`ImportRunStep` / `startImport`).
  The run report shows "X created · Y updated · Z flagged." `shared/types`: `IoObjectDto.canUpsert`,
  the import request `mode`, and the status `createdRows`/`updatedRows`.

---

## 4. Edge cases

- **Blank id cell in upsert** → create (the "new row in an edited export" path).
- **Whole CSV in upsert mode but a row's id is blank** → that specific row creates; others update.
  Mixed create/update in one run is expected and reflected in the counts.
- **Merge preserves required fields** — a merged record keeps existing values for unmapped required
  fields, so `PatchAsync`'s required-field validation passes; a row that would blank a required
  field (mapped to empty) surfaces as ValidationFailed → flagged.
- **Raced delete** — record found at lookup, deleted before Patch → `PatchAsync` NotFound → flagged
  (not a crash).
- **Non-upsert object with mode=upsert** — controller 400 before any work. Built-in descriptors are
  never handed Upsert mode.

---

## 5. Testing

- **Backend unit (xUnit):**
  - `CustomObjectIoObject.ImportRowAsync` upsert branch: blank id → Created via CreateAsync; valid id
    found → Updated via PatchAsync with a **merged** map (existing field preserved, mapped field
    overwritten, Name merged); invalid GUID → Flagged; dead id (GetById null) → Flagged;
    ValidationFailed on patch → Flagged. Create mode unchanged (Action defaults to Created).
  - Controller mode validation: upsert on a `CanUpsert=false` object → 400; upsert with no `id`
    mapping → 400; `id` accepted as a mapping key only in upsert mode.
  - `canUpsert` on the DTO (custom true, built-ins false); runner threads `Mode` and tallies
    created/updated.
- **Database (tSQLt):** `usp_CompleteImport` writes `CreatedRows`/`UpdatedRows`.
- **Integration:** `/io/objects` returns `canUpsert`; an upsert import returns 202 + status carrying
  created/updated (mirroring existing ImportExport test precedent — 401/403 gating harness).
- **Web:** wizard mode toggle appears only for `canUpsert` objects; upsert mode requires the Record
  ID mapping; the report renders created/updated/flagged. jest-axe on changed states.

---

## 6. Slicing

**One slice** — a single user-visible capability (upsert import) reusing existing record procs
(merge in C#), spanning a small migration + proc, backend threading + descriptor branch, and a
bounded wizard change. If the plan finds it exceeds the reviewable ceiling, split **backend/DB**
from **web**, but default to one slice.

---

## 7. Ship mechanics (program lesson — carry forward)

- Re-check the next migration number and `origin/dev` movement at every ship attempt (dev advances
  under concurrent sessions — SP5 rebased onto a 4-commit advance). Migration is `097` **only if**
  nothing else took it first; renumber if collided.
- Watch the DI graph: any new cross-module dependency risks the kind of circular-DI regression SP5's
  final review caught (invisible to mocked unit tests + 401-only integration tests). This feature
  adds no new registry/factory edge, but keep the container-resolution guard test green.
- Ship via manual `--no-ff` merge if built with per-task commits (SDD), re-verifying full gates
  after any rebase.
