# Unify the Field edit sheet (locked = full layout, disabled)

**Date:** 2026-07-24
**Status:** Approved (design)
**Surface:** Workspace Fields catalog (S30) + Platform Fields catalog (S34), Objects tab (consistency touch)

## Problem

The Fields catalog renders **two divergent sheets**, chosen at click time on `FieldCatalogRowDto.isReadOnly`:

- Editable fields → `FieldEditorSheet` — the full form (Display name, Field key, Type, Object, Location, Section, Required, Visible on stages, Conditional rules; Cancel / Save / Archive footer).
- System / locked fields → `FieldReadOnlySheet` — a stripped-down read-only `<dl>` that **drops** Section, Visible-on-stages, and Conditional rules, has **no footer** (header X only), and titles with just the field name (no "Edit " prefix).

Result: a system field looks structurally different from an editable one. The design prototype (`artifacts/docs/design/project/AI Solutions Tracker.html`) shows the intended behavior — locked fields render the **same full layout, disabled**, with a lock banner on top and a single CLOSE button.

The **Objects** tab already does this correctly: `ObjectEditorSheet` is one shared component with a `readOnly` branch (disabled inputs, lock banner, footer collapsed to a single Close). This spec makes Fields match that proven pattern.

## Goal

One shared sheet layout per catalog surface. Locked fields render the full editor form, disabled, with a source-appropriate lock info-banner and a single CLOSE footer. Same layout for editable and locked — only the disabled state, banner, and footer differ.

## Changes

### 1. `FieldEditorSheet` — add a `readOnly` branch

`web/src/features/fields/components/FieldEditorSheet.tsx` (and its sub-components `FieldEditorExtras`, `RulesEditor`, `TypeAndCategoryFields`, `OptionsEditor`).

- New prop `readOnly?: boolean` (default false) and `lockMessage?: string`.
- **Heading:** stays `Edit ${field.displayName}` for locked fields (matches prototype + Objects).
- **Lock banner:** when `readOnly`, render an **info** alert at the top of the body — pale-blue (`mws-alert mws-alert--info`), a leading lock icon, `role="note"`, text = `lockMessage`. (Replaces the previous `--warning` styling used by `FieldReadOnlySheet`.)
- **Disable every control** when `readOnly`: Display name, Field key, Type, Category, Object, Location, Section, Required toggle, numeric bounds, select options, calculation/derived config, Visible-on-stages checkboxes, and the Conditional rules editor. Combine with existing per-field `disabled` conditions (e.g. Field key / Object already `disabled={!isCreate}`).
- **Rules read-only:** existing rules render but Add / Edit / Delete controls are hidden or disabled; the empty state still shows "No rules."
- **Footer:** when `readOnly`, collapse to a **single CLOSE** button (right-aligned) — hide Cancel, Save field, and Archive. Mirrors `ObjectEditorSheet`'s `readOnly ? 'Close' : 'Cancel'` + Save-hidden logic.

### 2. `FieldsCatalogTab` — route locked rows through the shared path

`web/src/features/fields/components/FieldsCatalogTab.tsx`.

- Read-only rows go through the same `FieldEditLoader → FieldEditorSheet` path as edit mode, passing `readOnly` and the source-derived `lockMessage`, instead of dispatching to `FieldReadOnlySheet`.
- The editor `mode` collapses to: `create` (field=null, editable), `edit` (editable), `readonly` (loads full definition, renders `FieldEditorSheet` disabled).

### 3. Delete `FieldReadOnlySheet`

Remove `web/src/features/fields/components/FieldReadOnlySheet.tsx` and its test. Move the source → lock-message mapping into a small shared helper (e.g. `lockMessageForSource(source)`), consumed by both the workspace and platform catalogs.

### 4. Platform catalog — same treatment

`web/src/features/fields/components/PlatformFieldsCatalogTab.tsx` + `PlatformFieldEditorSheet.tsx` (S34) currently reuse `FieldReadOnlySheet` for locked rows. Add a `readOnly` branch to `PlatformFieldEditorSheet` itself (disabled inputs + lock banner + single CLOSE footer), so the platform surface unifies the same way and no longer depends on the deleted component. Per-surface unification, matching Objects.

### 5. Objects — banner consistency touch

`web/src/features/objects/components/ObjectEditorSheet.tsx`.

- Align the built-in lock banner to the same info style + leading lock icon used by the Fields banner, so the two tabs read identically. Heading (`Edit ${object.name}`) and footer (single Close) already match — no change there.

## Non-goals

- No backend / API / schema changes intended. (See risk below — if the field-definition endpoint doesn't serve locked fields, that's the only place backend work could surface; resolve in planning, not by expanding UI scope.)
- No change to which fields are locked vs editable (`isReadOnly` / `isSystem` semantics unchanged).
- No change to the Objects footer/heading logic (already correct).
- No change to the "view records" navigation on the Objects tab.

## Risk to verify in planning

Locked rows currently carry only the lightweight `FieldCatalogRowDto` (no Section, stage visibility, or rules). To populate the full disabled layout with real values, the read-only path must fetch the full `FieldDefinitionDto` via `FieldEditLoader`. **Verify the field-definition fetch returns data for System / Platform / foreign-Global fields rather than 403'ing.** If a definition isn't fetchable for some locked source, those sections fall back to their empty state (unchecked stages, "No rules") — which still matches the prototype. Confirm the actual endpoint behavior before assuming either path.

## Testing

- `FieldEditorSheet`: renders full layout with all controls disabled when `readOnly`; lock banner present with correct source message; footer shows only CLOSE; no Save/Cancel/Archive; rules render without Add/Edit/Delete. jest-axe on the readOnly state.
- `FieldsCatalogTab`: clicking a read-only row opens the shared editor in readOnly mode (not the deleted read-only sheet).
- `PlatformFieldEditorSheet`: readOnly branch parity (disabled + banner + CLOSE).
- `ObjectEditorSheet`: banner style/icon updated; existing readOnly behavior unchanged (regression guard).
- Remove/replace `FieldReadOnlySheet` tests.

## data-ds / design-system notes

- Sheet roots already carry `data-ds="sheet"` — unchanged.
- Lock banner uses `mws-alert mws-alert--info` (pale-blue, navy text — theme-stable). Lock icon is Phosphor `lock` (regular), `aria-hidden`.
- Buttons via `@/shared/components/Button`; CLOSE label renders ALL-CAPS via existing button styling.
