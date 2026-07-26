# Custom Fields on Global Objects (SP3b Slice 2) — Design

**Program:** custom-object-records — SP3b (Global/platform-owned custom objects).
**Prereq:** SP3b Slice 1 (Global custom objects) — SHIPPED to dev (merge `87becf8`). A Global custom
object is `dbo.ObjectDefinition` with `WorkspaceId = NULL`, `Location = 'Global'`, `IsSystem = 0`;
records stay per-workspace in `dbo.CustomRecords`.

**Goal:** let a Global (platform-owned) custom object carry a **field schema**, not just a Name — so
its records collect structured data in every workspace. Fields on a Global object are **platform-owned**
(authored only by platform admins, firm-wide) and render **read-only** in each workspace; a workspace
may additionally add its **own local fields** on top.

---

## Decomposition — two sub-slices

This capability spans a schema migration, ~6 stored procs, a new platform authoring surface, a
workspace-authoring relaxation, and the record query path — too large for one reviewable slice, and the
two halves carry independent rollout risk. Split:

- **Slice 2a — Platform-owned Global fields (THIS SPEC).** A platform admin defines fields (full
  parity: type, Select options, required flag, conditional rules) on a Global object; those fields
  surface **read-only** in every workspace, and their record values store, display, filter, and sort
  everywhere.
- **Slice 2b — Per-workspace local extensions (documented follow-on; separate spec/plan/build).** A
  workspace adds its *own* `LocalWorkspace` fields on top of a Global object's platform-defined ones.
  Cleanly stacks on 2a. Sketched at the end of this doc; NOT built in 2a.

Everything below is Slice 2a unless marked **[2b]**.

---

## Decisions (brainstormed, locked)

1. **Ownership = platform-owned.** A Global object's fields are firm-wide, authored only by platform
   admins, consistent with the object itself being platform-owned. They are read-only in workspaces.
2. **Full field parity.** Type (Text/Number/Date/Select/…), Select options, required flag, AND
   conditional rules/dependencies — the whole workspace field feature set.
3. **Per-workspace extensions are wanted** — but deferred to Slice 2b (2a is the platform-owned core).
4. **Records stay per-workspace** (unchanged from Slice 1); no `dbo.CustomRecords` schema change.

---

## Data model

### `dbo.FieldDefinition.WorkspaceId` → nullable (the one schema change)

Today `FieldDefinition.WorkspaceId` is `NOT NULL` (migration 014) — every field is pinned to an owning
workspace. A platform-owned Global field has **no** owning workspace, so this must become nullable,
mirroring exactly what migration 100 did to `ObjectDefinition`.

- A **platform Global field** = `WorkspaceId NULL`, `Location = 'Global'`, `ObjectType = <the Global
  object's ObjectKey slug>`.
- Re-scope the per-workspace unique index `UX_FieldDefinition_Workspace_Object_Key (WorkspaceId,
  ObjectType, FieldKey) WHERE IsDeleted = 0` → add `AND WorkspaceId IS NOT NULL`, so NULL-workspace
  rows don't participate in per-workspace uniqueness.
- The existing firm-wide uniqueness index **`UX_FieldDefinition_Global_Object_Key (ObjectType,
  FieldKey) WHERE Location = 'Global' AND IsDeleted = 0`** (migration 072/078) already enforces one
  Global field per (object, key) firm-wide — unchanged; platform Global fields land in it.

### Read-only-in-workspace falls out for free

`usp_GetWorkspaceFields` (and `…Options`, `…Rules`) compute `IsLocal = CASE WHEN d.WorkspaceId = @Ws
THEN 1 ELSE 0 END`. For a platform Global field, `d.WorkspaceId` is NULL, so `NULL = @Ws` is UNKNOWN →
`IsLocal = 0` in **every** workspace → the field renders foreign-Global / read-only automatically. No
new flag, no logic change to that computation.

### The isolation invariant (hold the line — this is the class of bug fixed in Slice 1)

Slice 1 had a Critical cross-tenant leak because reads detected "Global" by `Location='Global'` alone
while the workspace API let a tenant set that label. For **fields**, workspace-authored Global fields
on *built-in* objects (Request/Task) are a deliberate existing feature (the "Platform" location option),
so `Location='Global'` detection stays correct for the general field path. The isolation guarantee for a
**Global custom object's** fields rests on one invariant:

> **The workspace field editor/controller keeps blocking `Custom + Location='Global'`** (it returns 400
> today — `FieldsController.CreateField/UpdateField`). So on a Global object's slug, the ONLY
> `Location='Global'` rows are platform-owned (`WorkspaceId NULL`). A workspace's own fields on that
> slug are always `LocalWorkspace` (`WorkspaceId = @Ws`) — surfaced only to that workspace; another
> workspace's local field (not `@Ws`, not Global) never surfaces.

This keeps the same tenant-isolation shape as the object fix, without changing the general field
detection predicate (which must keep surfacing legitimate workspace-authored Global fields on built-ins).

---

## Components (Slice 2a)

### Database

1. **Migration `<NNN>_AlterFieldDefinition_NullableWorkspaceForGlobal.sql` (+ rollback).**
   `ALTER COLUMN WorkspaceId … NULL`; drop + recreate `UX_FieldDefinition_Workspace_Object_Key` with
   `WHERE WorkspaceId IS NOT NULL AND IsDeleted = 0`. Idempotent (`IF … EXISTS` guards);
   `MigrationHistory` row. Rollback pre-checks for any `WorkspaceId IS NULL` rows and `THROW`s before
   restoring `NOT NULL` (a Global field present ⇒ rollback blocked), recreates the index at its prior
   definition. **`ALTER COLUMN` nullability is metadata-only forward, but recreate the unique index in
   both directions.** Model exactly on migration 100 (objects). **Migration number is build-time —
   verify the next free number on `origin/dev` at build (collides on nearly every ship this program;
   dev tops at 100 now → likely 101, but re-check).**

2. **`usp_UpsertFieldDefinition` — accept `@WorkspaceId = NULL` (platform Global create/edit).**
   The proc currently assumes a non-null `@Ws`. Make the key/name-uniqueness check and the update-path
   existence check operate on the **Global namespace** when `@Ws IS NULL`: replace the `WHERE
   WorkspaceId = @Ws …` predicates with `((@Ws IS NULL AND Location = N'Global') OR WorkspaceId = @Ws)`
   (the pattern proven in `usp_UpsertObjectDefinition`). The INSERT stores `@Ws` (NULL for Global) —
   fine once the column is nullable; `@Location` is passed `'Global'` for platform fields. No caller
   contract change; workspace authoring keeps passing a real `@Ws`.

3. **`usp_RetireFieldDefinition` — accept `@WorkspaceId = NULL`.** Relax its existence/scope predicate
   the same way so a platform retire (`@Ws = NULL`) can retire a Global field. If it keys only on
   `FieldDefinitionId`, note that in the plan (no change).

4. **`usp_QueryCustomRecords` — widen the field-key whitelist to include Global fields.** The
   filter/sort whitelist currently joins `dbo.FieldDefinition WHERE WorkspaceId = @Ws AND ObjectType =
   @Slug …`. Change to `WHERE (WorkspaceId = @Ws OR Location = N'Global') AND ObjectType = @Slug AND
   IsDeleted = 0 AND IsRetired = 0`. This is the one functional gap: today a Global field's values
   *display* but silently drop from filter/sort. **Keep the exact parameterized whitelist join** — the
   dynamic-SQL predicate/sort still only ever reference keys that came out of this whitelist
   (`sp_executesql` params), so no injection surface is added. Scoped by `ObjectType = @Slug`, so no
   cross-object bleed; a different workspace's local field (not `@Ws`, not Global) is still excluded.

5. **Read procs `usp_GetWorkspaceFields` / `…Options` / `…Rules` — verify only.** They already union
   `Location='Global'` and compute `IsLocal` correctly for NULL-workspace rows. Confirm via tSQLt; no
   logic change expected. (The six field procs are already `@ObjectType NVARCHAR(64)` per migration 094;
   `FieldRuleDependency.ObjectType` is `NVARCHAR(64)` with its CHECK dropped — the rules path already
   accepts a Global object's slug.)

6. **tSQLt** (in `database/tests/`): `usp_UpsertFieldDefinition @WorkspaceId=NULL` creates a Global
   field (NULL workspace, `Location='Global'`, unique in the Global namespace); `usp_GetWorkspaceFields`
   surfaces a platform Global field as `IsLocal=0` from a non-owning workspace; **`usp_QueryCustomRecords`
   whitelist surfaces the Global field for filter/sort but EXCLUDES another workspace's local field on
   the same slug** (the leak-exclusion test, mirroring the object one); retire.

### API

7. **`FieldDefinition.WorkspaceId` → `Guid?`** on the row entity + any DTO that carries it.
   `MapField`-equivalent surfaces a NULL workspace as `Guid.Empty` (the same convention Slice 1 used for
   objects), so the web can distinguish a platform-owned field.

8. **Platform field CRUD (platform-admin gated).** Add create / edit / retire of a `FieldDefinition` on
   a **Global object**, mirroring `PlatformSchemaController`'s object CRUD from Slice 1:
   - Endpoints under the platform route (e.g. `POST/PATCH/DELETE /v1/platform/objects/{objectKey}/fields`
     or `/v1/platform/fields` with the target object in the body — pick one in the plan; prefer keying
     by the Global object's slug). Gated by `IAccessGuard.IsPlatformAdminAsync` (403 for non-admins,
     never 404), **auth-first** (mirrors Slice 1's `PlatformSchemaController`).
   - Delegate to the existing field service (`usp_Upsert/RetireFieldDefinition` + the options/rules
     writers) with `workspaceId: null`, `location: "Global"`, `objectType: <Global object slug>`. Full
     parity: type, Select options, required, conditional rules — the field service already writes all of
     these; the platform path just supplies a null workspace and forces Global.
   - Validate the target is a **Global custom object** (resolve the slug to an `ObjectDefinition` with
     `WorkspaceId IS NULL AND Location='Global' AND IsSystem=0`, else 404) before writing — so platform
     field authoring can't target a workspace object or a built-in.
   - Reuse `FieldOperationResult` / outcome→status mapping; duplicate key → 409, validation → 400.

9. **Platform field catalog — show Global custom objects' fields as editable.** Extend
   `FieldSchemaService.Catalog.GetPlatformCatalogAsync` / `BuildPlatformCatalogRows` so the platform
   Fields tab lists each Global **custom** object (from `usp_ListGlobalObjectDefinitions`) with its
   platform-owned fields as **editable** rows (`Source:"Platform"` or a suitable source), alongside the
   existing read-only bands (system auto-fields, `dbo.PlatformField`, Global fields across workspaces).
   The five synthetic system auto-fields per Global custom object surface read-only (as they do for
   built-in Global objects).

### Web

10. **Platform Fields tab — author fields on a Global object.** Add a "New field" flow whose Object
    picker offers the **Global custom objects**; the editor reuses the existing field editor
    (`FieldEditorSheet`) with `location` fixed to platform-owned Global (no Location control — always
    Global, mirroring Slice 1's `PlatformObjectEditorSheet` dropping the Location control) and full
    parity (type, options, required, rules). Per-field Edit / Retire on the Global-object rows;
    system auto-fields and other bands stay read-only. Reuse the platform mutation-hook +
    invalidate-query pattern from Slice 1. Destructive retire confirms inline (`role=alertdialog`, per
    Slice 1's delete-confirm). `data-ds` on design-system components; colocated tests + jest-axe.

11. **Workspace side — Global object fields render read-only.** A workspace opening a Global object's
    Fields (via the flat catalog, keyed by the object's slug) shows the platform Global fields
    foreign-Global / read-only (already the behavior once `usp_GetWorkspaceFields` returns them and
    `IsLocal=0` drives `isReadOnly`). Verify the catalog lists a Global object's slug as a field target
    for **reading** (a Global custom object appears in `usp_ListObjectDefinitions` post-Slice-1, so the
    catalog's custom-object enumeration should already include it — confirm).

### Records — mostly free

12. Values already store (`usp_Create/PatchCustomRecord` don't whitelist). With the query-whitelist fix
    (#4), filter/sort work in every workspace. **Verify CSV import/export** picks up a Global object's
    fields — it's driven by `IFieldSchemaService.GetSchemaAsync(ws, slug)`, which returns Global fields
    via the union, so the IO descriptor should include them; confirm and add a test if a gap appears.

---

## What Slice 2a does NOT do

- **No per-workspace local fields on a Global object** — that authoring path is Slice 2b.
- **No `dbo.CustomRecords` change** — records stay per-workspace.
- **No change to workspace-authored Global fields on built-in objects** (Request/Task) — the existing
  "Platform" location feature is untouched.
- **No new field types or rule capabilities** — reuse the existing field feature set as-is.

---

## Testing

- **tSQLt:** the four DB test cases in #6 (NULL-workspace upsert, read surfacing IsLocal=0, query
  whitelist Global-included / other-workspace-local-excluded, retire).
- **xUnit:** platform field CRUD is platform-admin gated (403 otherwise); platform field authoring
  rejects a non-Global-object target (404); workspace `FieldsController` still rejects Custom+Global
  (400) — the isolation invariant; catalog composition surfaces Global-object fields editable.
- **Web (Jest + jest-axe):** platform field editor create/edit/retire (full parity) with axe on the
  meaningful states; retire confirm dialog; workspace catalog renders a Global object's platform fields
  read-only.

## Risks

- **The `WorkspaceId`-nullable migration is the highest-risk step** — guarded index drop/recreate +
  NULL-guarded rollback, modelled exactly on migration 100.
- **The query-whitelist change is security-sensitive** — it feeds the dynamic filter/sort. Keep the
  parameterized whitelist join; the leak-exclusion tSQLt test guards both the injection boundary and
  tenant isolation.
- **Migration number collides every ship** — verify the next free number against `origin/dev` at build.

---

## Slice 2b — Per-workspace local extensions (follow-on; NOT built here)

A workspace adds its own `LocalWorkspace` fields on top of a Global object's platform-defined ones.

- **Relax the workspace `FieldsController.ResolveObjectTypeAsync`** so a Global object's slug resolves
  in a workspace context (the object becomes a valid field target for that workspace), **while keeping
  the `Custom + Global` 400 block** — a workspace's fields on it are always `LocalWorkspace`
  (`WorkspaceId = @Ws`).
- The workspace Fields catalog then shows: platform Global fields (read-only, foreign-Global) + the
  workspace's own local fields (editable). Records store/query both (the 2a whitelist union already
  covers `WorkspaceId=@Ws OR Location='Global'`).
- Read-side union already supports this — 2b is mostly the authoring-gate relaxation + its tests.

Separate spec → plan → build after 2a ships.
