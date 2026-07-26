# SP3b Slice 1 — Global (Platform-Owned) Custom Objects + Records — Design

**Date:** 2026-07-26
**Program:** custom-object-records-program (SP3b, slice 1 of 2)
**Status:** design approved; plan + build to follow
**Builds on (shipped to `dev`):** SP1 storage, SP2 records UI, SP3 fields, SP5 import/export, import-upsert.

---

## 1. Goal

Let **platform admins create firm-wide ("Global") custom objects** that every workspace can use, with **each workspace keeping its own records** of the shared object. This is Slice 1 of SP3b — the object + records + platform-create foundation. **Custom user fields on Global objects are Slice 2** (deferred); a Global object in Slice 1 carries only its Name + the standard system auto-fields.

Delivery decision (user): **ship Slice 1 (foundation) to `dev` first**, then Slice 2 (fields) as a follow-up. So there is an intentional window where Global objects exist on `dev` with a Name-only schema.

### Approved model

| Decision | Choice |
|---|---|
| Ownership | **Platform-owned** — `ObjectDefinition.WorkspaceId = NULL`, `Location='Global'`, `IsSystem=0`. Created/edited/deleted only by platform admins. |
| Who creates | **Platform admins only**, on a new Platform Objects create/edit surface. |
| Records | **Per-workspace** — each workspace's records point at the shared Global `ObjectDefinitionId`; `dbo.CustomRecords` is unchanged (`WorkspaceId NOT NULL`). No shared records. |
| Fields | **None in Slice 1** (Name + system auto-fields only). Custom Global fields = Slice 2. |
| Workspace access | Read-only object (locked editor, like Global fields today); full **records** CRUD + import/export/upsert per workspace. |

Distinction from built-in Global objects: Request/Task are `Location='Global'` **`IsSystem=1`** C# constants; a Global **custom** object is a `dbo.ObjectDefinition` row, `Location='Global'`, **`IsSystem=0`**, `WorkspaceId=NULL`.

---

## 2. Data model

- **`ObjectDefinition.WorkspaceId` → nullable.** Migration alters the column to `NULL` (the FK `FK_ObjectDefinition_Workspaces` already tolerates NULL — a null FK value is unchecked). A Global custom object row has `WorkspaceId=NULL`, `Location='Global'`, `IsSystem=0`.
- **Slug/name uniqueness re-scoped:**
  - The per-workspace unique indexes `UX_ObjectDefinition_Workspace_ObjectKey` and `UX_ObjectDefinition_Workspace_Name` are recreated `WHERE WorkspaceId IS NOT NULL AND IsDeleted=0` (so NULL-workspace Global rows don't fall under per-workspace uniqueness).
  - Add firm-wide Global indexes (mirroring `UX_FieldDefinition_Global_Object_Key`): `UX_ObjectDefinition_Global_ObjectKey ON (ObjectKey) WHERE Location='Global' AND IsDeleted=0` and `UX_ObjectDefinition_Global_Name ON (Name) WHERE Location='Global' AND IsDeleted=0`.
- **`dbo.CustomRecords` unchanged** — records stay `WorkspaceId NOT NULL`; a workspace's records reference the shared Global `ObjectDefinitionId`.
- **Entity:** `ObjectDefinitionRow.WorkspaceId` → `Guid?`. `ObjectDefinitionDto.WorkspaceId` stays `Guid` and maps a NULL to `Guid.Empty` (same convention `GetGlobalSystemObjects` already uses for built-ins).

---

## 3. Procs — relax to surface/accept Global objects (mirror the Global-field pattern)

- **`usp_ListObjectDefinitions @Ws`** → return the workspace's own custom objects **UNION** Global custom objects (`Location='Global'`), deduped **local-wins on `ObjectKey`** via `ROW_NUMBER() OVER (PARTITION BY ObjectKey ORDER BY <own-workspace first>)` — the exact pattern in `usp_GetWorkspaceFields`. (Handles the rare case where a workspace's own object shares a slug with a Global one: the local wins in that workspace.)
- **`usp_GetObjectDefinitionById @ObjectDefinitionId, @Ws`** → resolve when `WorkspaceId=@Ws OR Location='Global'` (so a workspace can look up a Global object it doesn't own — this is what `CustomRecordsService.GetByIdAsync` and every record-proc pre-check depend on).
- **`usp_GetCustomObjectCounts @Ws`** → include Global objects in the object set; each Global object's `RecordsCount` is **the calling workspace's** records of it (`CustomRecords WHERE WorkspaceId=@Ws AND ObjectDefinitionId=<globalId>`). `FieldsCount = 0` for Global objects in Slice 1 (no custom fields yet).
- **`usp_CreateCustomRecord`** → the object-existence check accepts a Global object (`ObjectDefinitionId=@Obj AND (WorkspaceId=@Ws OR Location='Global')`; keep error `50083` on genuine miss). The inserted record still carries the caller's `@Ws`.
- **`usp_QueryCustomRecords`** → the object resolution (and the field-whitelist join) accept a Global object (`WorkspaceId=@Ws OR Location='Global'`); records still filtered `WHERE cr.WorkspaceId=@Ws AND cr.ObjectDefinitionId=@obj`.
- **`usp_UpsertObjectDefinition`** → accept a NULL `@WorkspaceId` (platform create/edit). When `@WorkspaceId IS NULL` (Global), disambiguate the generated slug against the **Global** namespace (Global `ObjectKey`s) instead of the per-workspace namespace; keep the immutable-slug-on-rename rule.
- **New `usp_ListGlobalObjectDefinitions`** (no workspace param) → all Global custom objects (`Location='Global' AND IsSystem-equivalent (custom) AND IsDeleted=0`) for the platform Objects tab, with counts omitted (or a firm-wide records count — omit for Slice 1, like the platform Fields catalog).

`usp_GetCustomRecordById` / `usp_PatchCustomRecord` / `usp_DeleteCustomRecord` need **no SQL change** beyond the object pre-check already going through the relaxed `usp_GetObjectDefinitionById` (they scope records by `WorkspaceId + ObjectDefinitionId`, which stays correct — records are workspace-owned).

---

## 4. Platform create/manage surface (API + web)

**API — new platform-admin Object CRUD** (gated by `IsPlatformAdminAsync`, mirroring `PlatformFieldsController`):
- `POST /api/v1/platform/objects` — create a Global custom object (`WorkspaceId=NULL`, `Location='Global'`).
- `PATCH /api/v1/platform/objects/{objectId}` — edit (Name/PluralLabel/Description/etc.; **slug immutable**).
- `DELETE /api/v1/platform/objects/{objectId}` — soft-delete.
- All reject built-in / non-Global targets (400/404). `ObjectSchemaService` gains `ListGlobalAsync(ct)` (built-in Global constants + Global custom rows) feeding `GetGlobalObjects()`, and platform create/patch/delete methods that call `usp_UpsertObjectDefinition`/`usp_DeleteObjectDefinition` with `WorkspaceId=NULL`.

**Web — Platform Objects tab gains editing** (`PlatformObjectsTab.tsx`, today read-only):
- A "New object" button + a create/edit editor sheet (adapted from the workspace `ObjectEditorSheet`, platform-scoped: **no Location dropdown** — always Global; built-in rows stay read-only). Delete with confirmation.
- `usePlatformSchema`/`usePlatformObjects` gain create/patch/delete mutations against the new endpoints.

---

## 5. Workspace experience (read-only object, live records)

- **Objects tab:** Global custom objects appear in each workspace's Objects tab as **read-only** rows (`IsSystem=0 + Location='Global'`) — the editor opens locked (reuse the unify-field-edit-sheet locked pattern), since only platform admins edit them.
- **Records:** "View records" → the workspace's own records of the Global object; create / browse / edit / delete records all work per-workspace (the relaxed record procs). Columns = Name + system auto-fields (no custom fields yet).
- **Import/export/upsert:** because the IO descriptor resolves objects via `FindForWorkspaceAsync → IObjectSchemaService.ListAsync` (now Global-aware), Global custom objects appear in every workspace's import/export/upsert wizards automatically — no IO change needed.

---

## 6. Edge cases

- **Delete of a Global object** soft-deletes the definition; workspaces' existing records remain in `dbo.CustomRecords` but stop surfacing (the object no longer resolves). Acceptable for Slice 1; a records-cleanup/restore policy is out of scope.
- **Slug collision** (a workspace's local object vs a Global object with the same slug) → `usp_ListObjectDefinitions` local-wins dedup hides the Global one in that workspace; harmless and rare. Create-time slug disambiguation keeps Global slugs unique among Global objects.
- **A Global object with zero records in a workspace** → RecordsCount 0, empty records list (standard filtered/zero states).
- **Non-platform-admin** hitting the platform Object endpoints → 403 (existing `IsPlatformAdminAsync` gate).
- **Nullable `WorkspaceId` must not break existing per-workspace reads** — every existing `usp_*ObjectDefinition*` / record proc keeps working for `WorkspaceId IS NOT NULL` local objects; the Global branch is purely additive.

---

## 7. Testing

- **DB (tSQLt):** `usp_ListObjectDefinitions` returns local + Global with local-wins dedup; `usp_GetObjectDefinitionById` resolves a Global object from a non-owning workspace; `usp_CreateCustomRecord`/`usp_QueryCustomRecords` accept a Global object and scope records to the caller's workspace; `usp_UpsertObjectDefinition` creates a Global row (NULL workspace) with a Global-unique slug; `usp_GetCustomObjectCounts` counts per-workspace records of a Global object.
- **API (xUnit):** `ObjectSchemaService.ListGlobalAsync` + platform create/patch/delete (Global-only, reject built-ins); platform controller gating (403 non-platform-admin); `CustomRecordsService` create/query/get against a Global object from a workspace.
- **Web (Jest + jest-axe):** Platform Objects tab create/edit/delete flow; workspace Objects tab shows a Global object read-only (locked editor); records list/create works for a Global object. axe on each changed state.
- **Integration:** a Global object created via the platform endpoint surfaces in `usp_ListObjectDefinitions` for a different workspace; that workspace can create a record against it.

---

## 8. Slicing

**Slice 1 = one capability** (platform-managed Global objects + per-workspace records). Large (schema + ~7 procs + platform CRUD + web), so the plan decomposes it into TDD tasks (DB → object service/platform API → record-proc relaxation → platform web → workspace read-only surfacing), but it ships as one slice. **Slice 2 (custom fields on Global objects)** is a separate spec/plan/build after this ships.

---

## 9. Ship mechanics (program lessons — carry forward)

- **Migration number:** verify the next free number on `origin/dev` at build start (dev is at 099; expect **100**) — renumber if a concurrent slice takes it (this has collided on nearly every ship this program).
- **DI guard:** no new cross-module dependency is planned; keep the container-resolution guard test green (SP5's circular-DI lesson).
- Ship via manual `--no-ff` merge if built with per-task commits; rebase onto moved `dev` and re-run full gates before merge.
- **Nullable-column caution:** `ObjectDefinition.WorkspaceId` going nullable ripples through the entity + every proc that filters/join on it — the plan must enumerate every consumer and confirm `WorkspaceId IS NOT NULL` local behavior is unchanged.
