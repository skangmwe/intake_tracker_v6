# Export field dual-list transfer (with drag-reorder) — design

**Date:** 2026-07-27
**Status:** Approved (design), pending spec review
**Area:** `web/` (Export wizard field picker) + `api/` (export column ordering) — full-stack slice

## Problem

The Import/Export page's **Export** tab picks columns with a flat checkbox list
(`ExportFieldPicker`). The user wants the familiar **dual-list "shuttle" transfer** pattern
instead: an **Available** column on the left, a **Selected** column on the right, and controls to
move fields between them — and to **reorder** the Selected column so it sets the exported CSV
column order.

## Scope

**In scope:**
- Replace `ExportFieldPicker` (checkbox list) with a new `ExportFieldTransfer` dual-list component.
- Wizard field-selection state changes from an unordered `Set<string>` to an **ordered `string[]`**.
- Backend: `ExportService` emits CSV columns in the **requested `fieldKeys` order** (identity fields
  first), instead of registry order.
- Tests on both sides + E2E.

**Out of scope (explicitly dropped from the reference screenshot — no backing data here):**
- The "All Fields" **category** dropdown (fields carry no category — `IoFieldSpec` is
  `{ key, label, required?, alwaysIncluded? }`).
- "Select all fields from View" + **Add** (no saved-view hook in this wizard step).
- The **swap (⇄)** control.
- Any styling copied from the vendor chrome — this is built in the McDermott design system.

## Current state (verified)

- `ExportFieldPicker.tsx` — `fields: IoFieldSpec[]`, `selected: ReadonlySet<string>` (chosen keys,
  excludes always-included), `onToggle(key)`. `alwaysIncluded` fields render checked + locked.
- `ExportWizard.tsx` — `const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())`;
  resets on object-type change; exports `fieldKeys: [...selected]`; count line uses
  `selected.size + countLocked(active)`.
- `IoFieldSpec` (`shared/types/imports.ts`): `{ key, label, required?, alwaysIncluded? }`.
- `ExportService.cs` (lines ~99-102): `columns = exportFields.Where(f => f.AlwaysIncluded ||
  requested.Contains(f.Key)).ToList()` — **order follows `exportFields` (registry), the request
  order is ignored.** Validation: `requested.IsSubsetOf(exportKeys)` else `Unsupported` (400-class).
  `CsvExportWriter.WriteDataset(columns, rows)` renders columns in the order given (no change needed).

## Design

### 1. `ExportFieldTransfer` component (web)

New `web/src/features/import-export/components/ExportFieldTransfer.tsx`. Props:

```ts
interface ExportFieldTransferProps {
  fields: IoFieldSpec[];          // all exportable fields for the active object (incl. alwaysIncluded)
  selectedKeys: string[];         // ordered, excludes alwaysIncluded (identity) keys
  onChange: (nextSelectedKeys: string[]) => void;  // every move AND reorder flows through here
}
```

Layout — two McDermott panels (`--bg-surface`, 1px `--border-light`, 2px radius) side by side with a
center control column, wrapping to stacked on narrow viewports:

- **Available list** (left): `fields` where `!alwaysIncluded && !selectedKeys.includes(key)`, filtered
  by the Available filter box, rendered as a `role="listbox"` `aria-multiselectable="true"`; each row
  an option with `aria-selected`.
- **Selected list** (right): identity (`alwaysIncluded`) fields **pinned at top, locked** (a lock/note,
  not draggable, not removable), then `selectedKeys` **in order**, each draggable, filtered by the
  Selected filter box. Same listbox semantics.
- **Center controls** (icon buttons, Phosphor `caret-right`/`caret-left`/`caret-double-right`/
  `caret-double-left`, each with `aria-label`):
  - `Move →` — move the highlighted Available item(s) into Selected (append in their Available order).
  - `← Remove` — move the highlighted Selected (non-locked) item(s) back to Available.
  - `Move all ⇒` — move every visible-unlocked Available item to Selected.
  - `Clear all ⇐` — move every non-locked Selected item back to Available.
- **Per-column filter**: a search input (`magnifying-glass`, McDermott input) above each list; filters
  that side by label (case-insensitive). Moves/clear-all operate on the **filtered** visible set.

Interactions (both styles, per decision):
- **Click / double-click** an item → moves it to the other column immediately.
- **Ctrl/Cmd-click and Shift-click** → multi-select within a column; then the center buttons move the
  whole highlighted set.
- **Drag-to-reorder** within the Selected list (native HTML5 DnD — `draggable`, `dragover`,
  `drop`; **no new dependency**) sets `selectedKeys` order. Dragging is confined to the non-locked
  region (identity fields don't move). Dropping computes the new order and calls `onChange`.
- **Keyboard reorder (a11y — required, drag alone fails WCAG 2.1.1):** with a Selected item focused,
  **Alt+ArrowUp / Alt+ArrowDown** moves it up/down one position; announce via the option's position.
  Locked identity items are skipped.

Accessibility:
- Two labelled listboxes; roving-tabindex or standard listbox keyboard (↑/↓ to move focus,
  Space/Enter to toggle selection). Move buttons and both filters have accessible names.
- `jest-axe` on: populated, filtered, empty-Available, empty-Selected, and multi-select states.

`data-ds="field-transfer"` on the root (design-fidelity handle, `web-styling.md`).

### 2. Wizard state & data flow (web)

In `ExportWizard.tsx`:
- `const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())`
  → `const [selectedKeys, setSelectedKeys] = useState<string[]>([])`.
- `toggleField` removed; pass `onChange={setSelectedKeys}` to `ExportFieldTransfer`.
- Object-type change still resets: `setSelectedKeys([])`.
- Export: `exportMutation.mutate({ objectType, fieldKeys: selectedKeys })` — now the array order is
  the user's Selected order.
- Count line: `selectedKeys.length + countLocked(active)` (unchanged semantics).
- `ExportFieldPicker.tsx` + its test are removed (replaced by the transfer + its test).

### 3. Backend column ordering (api)

In `api/Api/Modules/ImportExport/ExportService.cs`, replace the columns build (keep the validation
above it) so the order is: identity fields first (registry order), then requested fields in the
**request's `fieldKeys` order**, de-duped:

```csharp
// Identity columns are always emitted, in the object's field order, first.
var identity = exportFields.Where(field => field.AlwaysIncluded).ToList();
var identityKeys = new HashSet<string>(identity.Select(field => field.Key), StringComparer.Ordinal);
var byKey = exportFields.ToDictionary(field => field.Key, StringComparer.Ordinal);
// Then the requested non-identity fields, in the exact order the caller sent them.
var selectedColumns = (fieldKeys ?? Array.Empty<string>())
    .Where(key => !identityKeys.Contains(key) && byKey.ContainsKey(key))
    .Select(key => byKey[key]);
var columns = identity.Concat(selectedColumns).ToList();
if (columns.Count == 0)
{
    return new ExportResult(ExportOutcome.Unsupported);
}
```

`CsvExportWriter.WriteDataset(columns, rows)` already renders in `columns` order — unchanged. The
`requested.IsSubsetOf(exportKeys)` validation stays exactly as-is (unknown key → `Unsupported`).

## Testing

- **Web — `ExportFieldTransfer.test.tsx`:** move one / many / all right; remove / clear-all; click and
  double-click move; Ctrl/Shift multi-select + button move; per-column filter narrows each side and
  move-all respects the filtered set; drag-reorder produces the expected `onChange` order; keyboard
  Alt+↑/↓ reorder; locked identity fields render locked and cannot be removed or reordered; `jest-axe`
  on populated / filtered / empty-each-side / multi-select.
- **Web — `ExportWizard.test.tsx`:** update to the ordered-array state; assert export sends
  `fieldKeys` in the Selected order (reorder then export → keys in new order); object-change resets.
- **Web — E2E (`e2e/`):** Export tab → move a couple of fields → reorder one → export; assert the
  request/flow reflects the chosen order.
- **API — `ExportService` xUnit:** columns are identity-first then in requested order; a reordered
  `fieldKeys` yields that column order; identity fields present even when absent from `fieldKeys`;
  unknown requested key → `Unsupported`; empty selection (identity-only) still exports identity columns.

## Risks / notes

- **Drag + a11y:** native HTML5 DnD is the drag mechanism (no dep), but the **keyboard reorder
  (Alt+↑/↓) is mandatory** and is the accessible path; both must land together. Safari HTML5 DnD
  quirks are covered by keeping drop logic simple (reorder within one list only).
- **Order contract:** the SPA already sends `fieldKeys` as an array; the only real change is that the
  backend now *honors* its order. No API signature/DTO change — lower risk.
- **No new dependency** (drag is native; per `api`/`web` "no new deps without discussion").
- Design-fidelity: this Export tab is a Save-for-/build screen (no prototype counterpart), so the
  render/compare gate does not diff it against a prototype; conformance (tokens) still applies.
