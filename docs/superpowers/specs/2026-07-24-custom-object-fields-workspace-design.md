# Fields on custom objects (workspace/Local) + "Global"→"Platform" rename (design)

**Date:** 2026-07-24
**Status:** Draft (for review)
**Program:** "Custom objects become first-class" — give admin-created custom objects real records,
fields, in-app CRUD, and CSV import/export. This spec is **Sub-project 3 (SP3)** of the program. It
builds on the shipped SP1 backend foundation
(`2026-07-24-custom-object-records-foundation-design.md`) and SP2 record CRUD UI
(`2026-07-24-custom-object-records-ui-design.md`).

## Problem

SP1 keyed the `FieldDefinition` pipeline on a custom object's immutable slug
(`ObjectDefinition.ObjectKey`), widened `FieldDefinition.ObjectType` 16→64, and dropped the closed
`ObjectType` CHECK — so a custom object *can already hold* field definitions at the data layer. SP2
consumes those fields: the record create/edit forms render one control per user field from
`GET /fields?objectType=<slug>`.

But **there is no UI to put fields on a custom object.** Today a custom object shows a `FieldsCount`
(its five synthesised read-only system auto-fields) and nothing more — an admin cannot add, edit, or
retire a *user* field on it from the product. The one gap is the authoring surface, and a few backend
guards that were never widened past the built-in object types.

The good news, established during scoping: **the flat Fields catalog already fully surfaces user
fields on custom objects.** `FieldSchemaService.Catalog.BuildCatalogRows` iterates every stored
`FieldDefinition` row — including `ObjectType = <slug>` — and renders it as an editable `Source:"User"`
row. And a complete field editor already exists (`FieldEditorSheet` + `createField`/`updateField`/
`retireField` + `OptionsEditor` + `RulesEditor`). So the moment a custom-object field can be *created*,
it appears in the catalog, is editable there, and drives the SP2 forms — with no new list/detail UI.

## Goal (SP3)

From the existing **Fields & objects → Fields** tab, a workspace admin can, entirely in the app:

- **Create** a `FieldDefinition` on any of the workspace's custom objects (Object dropdown now
  includes custom objects).
- **Edit** and **retire** those fields (already wired once the type/backend plumbing allows the slug).

New custom-object fields are **Local Workspace** scope. The created field immediately drives the SP2
record forms and shows as an editable `User` row in the flat catalog.

Separately, a display-only clarity change: **rename the "Global" field-location label to "Platform"**
app-wide (the stored value stays `Global`).

## Scope decisions (locked during brainstorming)

1. **Surface = the existing flat workspace Fields catalog only.** No new per-object fields surface;
   custom-object fields are managed from the same Fields tab as built-ins, filtered/found by object.
   (Rejected: a per-object fields tab on the SP2 record list.)
2. **Custom-object fields are Local Workspace, locked.** When a custom object is the selected Object,
   the Location control is forced to Local Workspace and disabled. Rationale: the Global/Platform path
   for custom objects requires Global-capable objects + cross-workspace propagation + Global-object
   records — none of which exist yet (`usp_ListObjectDefinitions` filters `WHERE WorkspaceId = @Ws`;
   the Objects-tab create hardcodes `LocalWorkspace`). That whole chain is **SP3b** (see Non-goals).
3. **Rename "Global" → "Platform"** (display label only) is in SP3. Even though Global-scoped
   *custom-object* fields land in SP3b, the rename is a self-contained clarity win for the existing
   built-in Global fields and gives the "Platform" vocabulary now.

## Non-goals / out of scope → SP3b (own spec+plan)

- Global-capable custom objects (creating a custom object with `Location='Global'`).
- Cross-workspace propagation of custom objects (`usp_ListObjectDefinitions` surfacing Global objects
  in every workspace).
- Global-object **records** semantics (per-workspace records against a shared Global object).
- **Platform-scoped fields on custom objects** (Location=Global for a custom object) and any
  create/edit affordance for them on the **platform** Fields page.

SP3 does not touch the platform Fields page's create path (Global fields are not authored there for
any object today — the Global mechanic is the workspace editor's Location dropdown).

## Design

### Part 1 — Frontend: custom objects selectable in the Fields editor

This is the entire user-visible change.

- **`FieldsCatalogTab`** fetches the workspace's custom objects via `useWorkspaceObjects` and passes
  the non-system ones (`!isSystem` → `{ value: objectKey, label: name }`) into `FieldEditorSheet` as
  an extra "custom objects" option group.
- **`FieldEditorSheet` Object dropdown** = built-in `OBJECT_OPTIONS` + a "Custom objects" `<optgroup>`
  of the passed custom objects. On edit, the Object select stays disabled (existing behaviour); it just
  needs to render the current slug's label.
- **Location control:** when the selected object is a custom object (value not in the built-in set),
  force `location = 'LocalWorkspace'` and disable the Location `<select>` with a caption hint
  (e.g. "Custom-object fields are workspace-local"). For built-in objects the control is unchanged.
- **Field-type set:** custom objects use the full `FIELD_TYPE_OPTIONS` (same as Request), not the
  Task-restricted set.
- **Options / rules(conditions):** `OptionsEditor` and `RulesEditor` stay enabled — they operate on
  the field's own options and same-object field keys, which work generically for a custom object.

No changes to the catalog *list* rendering: user fields on custom objects already appear (verified),
and edit/retire from a catalog row already dispatch through the existing editor + api once the typing
below allows the slug.

### Part 2 — Typing: widen only at the editor/api boundary

Keep the closed `FieldObjectType` union (`Request|Task|Feature|ToolkitItem|Attachment`) everywhere it
is used today. Introduce a boundary alias for the places that must carry a custom slug:

```ts
// slugs allowed, built-in autocomplete preserved
export type FieldObjectTypeOrSlug = FieldObjectType | (string & {});
```

Use it for: the editor's `object` form value, the `createField`/`updateField`/`retireField` request
`objectType`, and the catalog row's `objectType` where it flows into those calls. This mirrors SP2's
"cast at one boundary" discipline — no broad loosening of the union across the app.

### Part 3 — Backend: close the three object-type guards

The `FieldDefinition` data layer already accepts slugs (SP1 dropped the CHECK). Three controller/
service guards were never widened past built-ins and must be:

- **`CreateField` (POST `/v1/workspaces/{ws}/fields`):** when `request.ObjectType` is not a built-in,
  resolve it to a real **non-system** `ObjectDefinition` in the workspace via
  `IObjectSchemaService.ListAsync` (`!IsSystem && ObjectKey == objectType`, ordinal). No match →
  **404 (never disclose whether the slug exists)**, mirroring the already-widened `GetFields`. When
  the object *is* a custom object, also reject `Location == "Global"` → **400** ("Custom-object fields
  are workspace-local.") — Global-custom-object support is SP3b.
- **`RetireField` (POST `/fields/{fieldKey}/retire`):** the current `IsValidObjectType(objectType)`
  gate rejects any custom slug with 400. Widen it the same way: built-in passes; otherwise resolve the
  slug to a real non-system object → else 404. Keep the built-in-only fast path for the default
  `objectType == "Request"`.
- **`UpdateField` (PATCH `/fields/{fieldKey}`):** defense-in-depth — apply the same custom-slug
  validity + Local-only guard. The UI fixes the object on edit, but the API must not trust the client:
  a PATCH whose `ObjectType` is an unknown slug → 404; a custom-object field with `Location=="Global"`
  → 400.

Factor the "resolve a possibly-custom objectType, or 404" logic into one private helper on the
controller so the three handlers share it and stay consistent with `GetFields`.

No stored-procedure changes are expected — the guards are app-layer validation over the existing
`usp_UpsertFieldDefinition` / `usp_RetireFieldDefinition`. (Confirm during build; if a proc rejects a
slug, that becomes a fourth backend task, but SP1 already widened the column and dropped the CHECK.)

### Part 4 — Rename "Global" → "Platform" (display label only)

The **stored value stays `Global`** everywhere: DB `FieldDefinition.Location`, DTO `Location`, the TS
`FieldLocation` type's `'Global'` member, all procs. Only user-facing strings change:

- `FIELD_LOCATION_OPTIONS` label `'Global'` → `'Platform'` (value stays `'Global'`).
- `fieldLocationLabel('Global')` → returns `'Platform'`.
- Any catalog "Location" cell or read-only sheet that prints the literal "Global" for a **field**
  location.
- "Local Workspace" is unchanged.

Enumerate every field-location render site during build (grep for the literal and for
`fieldLocationLabel`) and update the label at each. This is scoped to **field** location only — do not
touch **object** location labels (`ObjectLocation` in the Objects tab) unless the same helper is shared;
if a shared helper is used, confirm the object surface reads correctly with "Platform" too, otherwise
keep them separate.

## Data flow

```
Admin: Fields tab → New field → Object = <custom object> (from useWorkspaceObjects, !isSystem)
  → Location forced LocalWorkspace (disabled) → type/options/rules as normal → Save
    → POST /fields { objectType: <slug>, location: "LocalWorkspace", ... }
      → CreateField resolves slug → real custom object? no → 404 ; Global on custom? → 400
        → usp_UpsertFieldDefinition (ObjectType = slug)  [existing]
  → catalog invalidates → field shows as editable User row (existing BuildCatalogRows path)
  → SP2 record forms: GET /fields?objectType=<slug> now returns the new field → renders a control
```

## Error handling

- Non-member / non-admin on create/update/retire → 403 (existing access gates, unchanged).
- Unknown/inaccessible custom slug → **404, never disclosing existence** (matches `GetFields`).
- Global location on a custom-object field → **400** with a plain-language `detail`.
- Frontend: the editor surfaces the API's 400/404 via its existing error path; the Location lock
  prevents the 400 from being reachable through the UI (the guard is defense-in-depth for the API).

## Testing

- **Editor (`FieldEditorSheet` / `FieldsCatalogTab`):** custom object appears in the Object dropdown;
  selecting it forces + disables Location = Local Workspace; create/edit/retire happy paths dispatch
  with the slug objectType; full field-type set available. jest-axe on the editor states.
- **Backend unit (`FieldsController` / `FieldSchemaService`):** create/update/retire —
  (a) built-in objectType unchanged; (b) valid custom slug resolves and succeeds; (c) unknown slug →
  404; (d) custom object + Location=Global → 400; (e) non-admin → 403. Mock `IObjectSchemaService`.
- **Catalog render:** a Local custom-object user field renders as an editable `User` row; the Location
  label reads "Platform" for a Global field (rename check).
- **tSQLt:** only if a proc changes (not expected). If the upsert/retire procs already accept a slug
  (SP1), no tSQLt is added.

## Rollout

Single slice — the change is small and cohesive (frontend editor plumbing + typing boundary + three
backend guards + a display rename), touches one feature area (fields), and ships one capability
(author fields on a custom object). Per `slicing.md`, no split is warranted.
