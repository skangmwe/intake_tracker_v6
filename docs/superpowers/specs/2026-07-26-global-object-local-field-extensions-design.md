# Per-workspace Local Field Extensions on Global Objects (SP3b Slice 2b) — Design

**Program:** custom-object-records — SP3b (Global/platform-owned custom objects).
**Prereq:** SP3b Slice 2a (custom fields on Global objects) — SHIPPED to dev (merge `84b4d26`).
**Design decision source:** brainstormed and locked 2026-07-26 (see Decisions below).

**Goal:** let a workspace admin add their **own** `LocalWorkspace` fields to a platform-owned Global
custom object, stacked on top of the object's read-only platform Global fields — safely. Records in
that workspace collect both bands; the platform fields stay read-only in the workspace; another
workspace's local fields never leak.

---

## The finding that shapes this slice — the plumbing is already wired

Slice 2a's end-of-doc sketch assumed 2b was an "authoring-gate relaxation + catalog + web build." Tracing
the shipped code shows the gate is **already open** — the relaxation happened as a side effect of Slice
1/2a's `usp_ListObjectDefinitions` change. What already works, verified end-to-end:

1. **Resolution.** `usp_ListObjectDefinitions @WorkspaceId` returns inherited-Global objects, so
   `FieldsController.ResolveObjectTypeAsync` resolves a Global object's slug to `Custom` in a workspace.
2. **Write gate.** The controller's `Custom + Global` 400 block fires only when `Location == "Global"`; a
   `LocalWorkspace` field passes to `usp_UpsertFieldDefinition`, which writes `WorkspaceId = @Ws` (its
   lookup matches only the caller's own rows — `usp_UpsertFieldDefinition.sql` line 90).
3. **Catalog.** `FieldSchemaService.Catalog.BuildCatalogRows` marks platform Global fields read-only
   (`!row.IsLocal`, line 216) and the workspace's own local fields editable.
4. **Records.** `usp_QueryCustomRecords`'s filter/sort whitelist already unions
   `WorkspaceId = @Ws OR Location = 'Global'` (the 2a fix), so a local field's values store, display,
   filter, and sort.
5. **Web.** `FieldObjectAndLocationFields` treats any custom object (including a Global one) as
   workspace-local — picking it forces `location: 'LocalWorkspace'` and disables the Location control;
   the "New field" object picker (`customObjectOptions`, sourced from `useWorkspaceObjects` which returns
   inherited-Global objects) already lists Global custom objects.

So 2b is **"guard + verify + expose"**, not a from-scratch build: close the one correctness hole, prove
the wired path with tests, and confirm the web affordance.

---

## Decisions (brainstormed, locked)

1. **Scope = guard + verify + expose.** Minimal net-new code. Add the collision guard, write the missing
   tests to prove the wired path end-to-end, and confirm/finish the web affordance.
2. **The collision guard is symmetric** (both authoring directions), enforced authoritatively in the one
   proc both paths share (`usp_UpsertFieldDefinition`).
3. **No schema migration.** The guard is a proc-body change (procs re-apply on every deploy via
   `CREATE OR ALTER`), plus a small service change and tests. No new migration number.

---

## The one real change — the symmetric collision guard

### The hole

On a Global object, `dbo.CustomRecords.FieldValues` JSON is keyed by `FieldKey`. Nothing today stops the
existence of **two** live `FieldDefinition` rows sharing one `(ObjectType, FieldKey)` — one platform
Global (`WorkspaceId NULL, Location='Global'`) and one workspace-local (`WorkspaceId=@Ws,
Location='LocalWorkspace'`) — which corrupts read/write for that object's records **in that workspace**.
Neither existing filtered unique index catches it (they partition on `Location='Global'` vs `WorkspaceId
IS NOT NULL` respectively), and the constraint — "for a given workspace, the effective keyspace =
{platform Global keys} ∪ {that workspace's local keys} must be unique" — is a per-read-union invariant
that no single filtered unique index can express. A proc-level `EXISTS` guard is the correct tool.

### Coverage today, by direction

- **Workspace → Global (already blocked; verify only).** `FieldSchemaService.UpsertFieldAsync` reads the
  union (`ReadFieldsAsync(workspaceId, objectType)`, line 164), so a colliding platform Global field
  surfaces as `current`; `isCreate && current is not null` returns `Conflict` → **409** before the proc is
  called (line 167-169). Rename can't reach this — the update path pins `request.FieldKey` to the route
  key, so `FieldKey` is immutable via update. **No code change; add a test to lock it in.**
- **Platform → Workspace (the genuinely uncovered direction).**
  `FieldSchemaService.UpsertGlobalObjectFieldAsync` reads only `ReadFieldsAsync(Guid.Empty, objectKey)` =
  `Location='Global'` rows (line 290), so it never sees a workspace's local field of the same key; the
  platform admin creates a colliding Global field. **This is what the guard closes.**

### The guard

**Proc (`usp_UpsertFieldDefinition`) — authoritative, symmetric.** After the same-namespace lookup that
resolves `@FieldDefinitionId`, and before insert/update, add a cross-namespace collision check:

- **Workspace call** (`@WorkspaceIdLocal IS NOT NULL`): `THROW` if a live platform Global field exists on
  the same `(ObjectType, FieldKey)` —
  `EXISTS (… WHERE WorkspaceId IS NULL AND Location = N'Global' AND ObjectType=@ObjectTypeLocal AND
  FieldKey=@FieldKeyLocal AND IsDeleted=0)`.
- **Platform call** (`@WorkspaceIdLocal IS NULL`): `THROW` if any live workspace-local field exists on the
  same `(ObjectType, FieldKey)` in any workspace —
  `EXISTS (… WHERE WorkspaceId IS NOT NULL AND ObjectType=@ObjectTypeLocal AND FieldKey=@FieldKeyLocal AND
  IsDeleted=0)`.
- Use a new error number: `THROW 50011, '<message>', 1;` The check must run **after** `@FieldDefinitionId`
  is resolved so a legitimate re-save of the field itself (which matches only its own namespace's row)
  never trips its opposite-namespace check.

**Service — map the proc error to a clean 409.** Both service upsert methods (`UpsertFieldAsync` and
`UpsertGlobalObjectFieldAsync`) wrap their `ExecuteUpsertAsync` call and map `SqlException` with
`Number == 50011` to `FieldOperationOutcome.Conflict`. Both controllers already map `Conflict → 409` (the
workspace `FieldsController.MapUpsert`; the platform field CRUD path). In practice the workspace path
never reaches the proc for this case (its union pre-check returns `Conflict` first); the mapping guarantees
the platform path — and any future caller — surfaces 409 rather than a bubbled 500.

### Why the guard is inherently scoped to Global custom objects (no collateral damage)

`WorkspaceId IS NULL` `FieldDefinition` rows exist **only** for Global custom object fields (2a made
`WorkspaceId` nullable for exactly this). On built-in Request/Task, a workspace-authored Global field —
the deliberate existing "Platform-location" feature — is stored `WorkspaceId=<real ws>, Location='Global'`,
never `WorkspaceId NULL`. So:

- the **workspace-side** check (`WorkspaceId IS NULL AND Location='Global'`) matches nothing on built-ins →
  no-op there;
- the **platform-side** check runs only when the caller passes `@WorkspaceId=NULL`, which only the Global
  custom object authoring path does.

A regression test (a workspace-authored Global field on the Request built-in still saves) locks this in.

---

## Components

### Database
1. **`usp_UpsertFieldDefinition`** — add the symmetric cross-namespace `EXISTS` guard (`THROW 50011`),
   placed after the `@FieldDefinitionId` resolution, before the insert/update branch. Update the header
   comment to document the guard and its Global-custom-object scoping. No signature change.
2. **tSQLt** (`database/tests/fields/`):
   - workspace-local field on a Global object stores (`WorkspaceId=@Ws, Location='LocalWorkspace'`) and is
     returned by `usp_GetWorkspaceFields` as `IsLocal=1` (editable);
   - `usp_QueryCustomRecords` filter/sort includes that local field's values, and **excludes** another
     workspace's local field on the same slug (the isolation case);
   - **guard, workspace call:** creating a local field whose key equals a live platform Global field on the
     object throws `50011`;
   - **guard, platform call:** `usp_UpsertFieldDefinition @WorkspaceId=NULL` for a Global field whose key a
     workspace already uses locally throws `50011`;
   - **regression:** a workspace-authored Global field on the Request built-in still upserts (guard no-op on
     built-ins).

### API
3. **`FieldSchemaService`** — in `UpsertFieldAsync` and `UpsertGlobalObjectFieldAsync`, catch
   `SqlException` with `Number == 50011` around the proc execution and return
   `FieldOperationOutcome.Conflict`. No controller change (both already map `Conflict → 409`).
4. **xUnit** (`api/Api.Tests/`):
   - workspace admin creates a `LocalWorkspace` field on a Global object slug → 201 (proves the wired
     path);
   - workspace create colliding with a platform Global field key → 409;
   - platform field create colliding with an existing workspace-local key → 409;
   - editing / retiring a platform Global field **from a workspace** → 403 (assert the existing
     `ForeignGlobal` / `PlatformDefined` locks hold for the local-extension scenario);
   - the isolation invariant regression: workspace `FieldsController` still rejects `Custom + Global` (400).

### Web
5. **Verify + finish the affordance (Jest + jest-axe).** Confirm the New-field flow on a Global object
   creates a `LocalWorkspace` field (Location forced/disabled), the platform Global rows render read-only,
   the workspace's own local fields are editable/retire-able, and a 409 collision surfaces the
   problem-detail message. Add colocated tests with axe on the meaningful states. Any gap found here is a
   small fix, not a rebuild — `data-ds` already present on the reused design-system components.

### Records — free
6. Values already store (`usp_Create/PatchCustomRecord` don't whitelist) and query (2a whitelist union).
   Confirm CSV import/export picks up a Global object's local fields — it is driven by
   `IFieldSchemaService.GetSchemaAsync(ws, slug)`, whose union returns both bands; add a test only if a gap
   appears.

---

## What this slice does NOT do

- **No `dbo.CustomRecords` change** — records stay per-workspace, `FieldValues` JSON unchanged.
- **No schema migration** — proc-body + service change + tests only.
- **No new field types or rule capabilities** — reuse the existing field feature set as-is.
- **No change to built-in Global authoring** (the "Platform-location" feature on Request/Task) — the guard
  is a no-op there by construction, guarded by a regression test.

---

## Testing summary

- **tSQLt:** the five DB cases in Database #2 (store + IsLocal; query-whitelist include/exclude; guard both
  directions; built-in regression).
- **xUnit:** the five API cases in API #4 (create local field 201; collision both directions 409; platform
  field read-only from workspace 403; `Custom + Global` still 400).
- **Web (Jest + jest-axe):** New-field-on-Global-object creates local field; platform rows read-only; local
  rows editable; 409 message surfaces; axe on meaningful states.

## Risks

- **The guard's placement matters** — it must run after `@FieldDefinitionId` resolution so a legitimate
  re-save never trips the opposite-namespace check. The both-directions tSQLt cases plus a re-save case
  guard this.
- **Low blast radius otherwise** — no migration, no schema change, one proc body, one `catch` per service
  method. The isolation and built-in-regression tests are the safety net.
