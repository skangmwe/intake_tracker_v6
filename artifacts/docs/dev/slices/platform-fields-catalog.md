# Slice B1 — Platform Fields tab as a catalog

**Branch:** `slice/platform-fields-catalog` · **Date:** 2026-07-22 · **Tiers:** DB proc, API endpoint/service, Web component, shared type

Second half of the workspace-vs-platform fields split (see [[workspace-vs-platform-fields-scoping]]).
Slice A scoped the **workspace** Fields tab to its own fields. B1 rebuilds the **Platform** Fields
screen (S34) from a bespoke `<ul>` list into the same catalog table the workspace uses, showing the
platform-level fields "inherited by every workspace." (B2, later, adds the Objects + Relationships
tabs.)

## What the Platform Fields tab shows (three sources, deduped by object+key)

1. **System auto-fields** synthesised per **Global object** (Request, Task): Record ID, Name, Date
   created, Last updated, Created by — `Source=System`, read-only, `Location=Global`.
2. **Platform-defined fields** from `dbo.PlatformField`, **excluding `Category='System'`** entries
   (record-id, workspace, created-at, updated-at — those duplicate #1). What remains — Origin, Legacy
   ID, AI Solutions Status — is placed on the **Request** object, `Source=Platform`. Editable by a
   platform admin where `IsSystemImmutable=0` (Legacy ID, AI Solutions Status) via the existing
   `PATCH /v1/platform/fields/{fieldKey}`; the rest read-only.
3. **Global fields** (`FieldDefinition` where `Location='Global'`, `IsPlatformDefined=0`, any
   workspace) on their object — `Source=User`, **read-only here** (editable only in the owning
   workspace). This is the home the Global fields Slice A removed from other workspaces' views.

## Layers

- **DB:** new `usp_GetPlatformFieldCatalog` — returns every Global, non-platform `FieldDefinition`
  row (across workspaces) in the `FieldCatalogRow` shape (`IsLocal=0`). The Global unique index
  guarantees one row per (object, key). tSQLt: returns Globals across workspaces, excludes Local /
  platform-defined / deleted.
- **API:** `PlatformFieldCatalogDto { rows: FieldCatalogRowDto[] }`; `FieldSchemaService.GetPlatformCatalogAsync`
  (reads the new proc + `usp_GetPlatformFields`, calls the pure `BuildPlatformCatalogRows(globalStored,
  platformDefined)`); `GET /v1/platform/fields/catalog` on `PlatformFieldsController`, platform-admin
  gated (403 for non-admins). `FieldType` mapping for platform-defined rows: Text→ShortText,
  DateTime→DateTime, Select→SingleSelect, Lookup→ShortText. xUnit: `BuildPlatformCatalogRows` cases
  (system per Global object, System-category platform fields suppressed, editable vs immutable,
  Global rows read-only, dedup) + controller 200 (admin) / 403 (non-admin).
- **shared:** extend `FieldSource` to `'System' | 'User' | 'Platform'`.
- **Web:** `fetchPlatformFieldCatalog` + `usePlatformFieldCatalog`; rebuild `PlatformFieldsPage` into a
  platform analogue of `FieldsCatalogTab` (reuses `fieldCatalogView`, `FieldCatalogTable`,
  `FieldReadOnlySheet`); a small `PlatformFieldEditorSheet` (name + Select options) that PATCHes the
  platform field and invalidates both platform queries. `FieldCatalogTable` gains a `caption` prop and
  a `Platform` source pill. Row click routes: `Source=Platform && !isReadOnly` → editor sheet; else
  read-only sheet. Platform-admin gate + loading/error/empty states retained. Tests + jest-axe per
  state.

## Editing preserved

Platform-defined edit path is unchanged (`useUpdatePlatformField` → `PATCH /v1/platform/fields/{key}`
→ `usp_UpdatePlatformField`); B1 only moves the trigger from an inline list row into a sheet opened
from the catalog table, and additionally invalidates the new catalog query on save.

## Coverage note

Web `test:coverage` reports global **branches 79.72%** — inside the tolerated `[78%, 80%)` band
(`web-testing.md`). Every required behaviour/state case for the new components is covered
(no-access, loading, error, empty, filtered-to-zero table render, platform edit, read-only sheet,
disabled-while-saving, empty-name guard, Select options, Escape, plus jest-axe per state). Adding
four more tests moved the global figure only +0.03% (79.69 → 79.72), confirming the shortfall is
spread across the pre-existing codebase, not this slice's files. Lines 90.3% / functions 82.8% /
statements 89.0% all clear the floor. 1436/1436 web tests pass.

## Out of scope (B2)

Platform **Objects** tab (Global objects) and **Relationships** tab (read-only reference). The tab bar
is introduced in B2; B1 renders the Fields catalog as the platform screen body.
