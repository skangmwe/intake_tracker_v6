# Unify the Field edit sheet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Locked (System / Platform / foreign-Global) fields open the **same full editor layout** as editable fields — disabled, with a lock info-banner on top and a single CLOSE footer — replacing the stripped-down `FieldReadOnlySheet`.

**Architecture:** Give `FieldEditorSheet` a `readOnly` mode. Locked rows seed the sheet's form directly from the lightweight `FieldCatalogRowDto` (a new pure helper) — **no definition fetch**, because System rows are synthesised (`id = system:{object}:{key}`) and aren't in `useWorkspaceFields`'s schema. Both the workspace (S30) and platform (S34) catalogs render this one read-only sheet for locked rows; `FieldReadOnlySheet` is deleted. The Objects sheet already uses this one-component pattern; a small banner touch aligns the two.

**Tech Stack:** React 19 + TypeScript, Jest + React Testing Library + jest-axe, SCSS/CSS with `mws-*` design tokens, `@phosphor-icons/react`.

## Global Constraints

- Design tokens only — no raw hex / rgb / off-spec radii in `.css`/`.tsx` (blocking gate). Lock banner uses `mws-alert mws-alert--info` (pale-blue, navy text — theme-stable). Reuse existing `.fields-sheet__lock` class.
- Every design-system sheet keeps `data-ds="sheet"` on its root (already present).
- Component length ≤ 200 lines (page/route ≤ 250 with justification). Keep sub-components split as they are.
- Every component test includes a jest-axe assertion across each meaningfully different rendered state. Coverage floor 80%.
- No `any`, no floating promises, named-const for enumerable option lists, `crypto.randomUUID()` for client ids (already used).
- Icons: Phosphor **regular** weight only, sizes from the fixed scale (16 used here). `LockSimple` at 16px, `aria-hidden`.
- Buttons never wrap; labels short. `Button`/`IconButton` from `@/shared/components/Button` (both accept `disabled`).

---

### Task 1: Pure helpers — seed a form from a catalog row, and the lock message

**Files:**
- Modify: `web/src/features/fields/fieldForm.ts` (add `buildFormFromCatalogRow`)
- Modify: `web/src/features/fields/constants.ts` (add `lockMessageForSource`)
- Test: `web/src/features/fields/fieldForm.test.ts`, `web/src/features/fields/constants.test.ts`

**Interfaces:**
- Produces: `buildFormFromCatalogRow(row: FieldCatalogRowDto): FieldForm` — maps the row's known fields (object, location, fieldKey, displayName, fieldType, isRequired) and defaults everything the row lacks (category `'WorkspaceLocal'`, section `''`, min/max `''`, `visibleStages: []`, `options: []`, `rules: []`, expression/defaultValue `''`).
- Produces: `lockMessageForSource(source: FieldSource): string` — the three source-keyed lock strings (verbatim from the deleted `FieldReadOnlySheet`).

- [ ] **Step 1: Write the failing test for `buildFormFromCatalogRow`**

Add to `web/src/features/fields/fieldForm.test.ts`:

```ts
import { buildFormFromCatalogRow } from './fieldForm';
import type { FieldCatalogRowDto } from '@shared/types';

const systemRow: FieldCatalogRowDto = {
  id: 'system:Request:recordId',
  objectType: 'Request',
  objectLabel: 'Request',
  fieldKey: 'recordId',
  displayName: 'Record ID',
  fieldType: 'ShortText',
  location: 'Global',
  isRequired: true,
  source: 'System',
  status: 'Active',
  isReadOnly: true,
};

it('buildFormFromCatalogRow — system row — maps known fields and empties the rest', () => {
  // Act
  const form = buildFormFromCatalogRow(systemRow);

  // Assert
  expect(form.object).toBe('Request');
  expect(form.fieldKey).toBe('recordId');
  expect(form.displayName).toBe('Record ID');
  expect(form.fieldType).toBe('ShortText');
  expect(form.location).toBe('Global');
  expect(form.isRequired).toBe(true);
  expect(form.section).toBe('');
  expect(form.visibleStages).toEqual([]);
  expect(form.options).toEqual([]);
  expect(form.rules).toEqual([]);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && npx jest src/features/fields/fieldForm.test.ts -t buildFormFromCatalogRow`
Expected: FAIL — `buildFormFromCatalogRow` is not exported.

- [ ] **Step 3: Implement `buildFormFromCatalogRow`**

Append to `web/src/features/fields/fieldForm.ts` (import `FieldCatalogRowDto` in the existing `@shared/types` import block):

```ts
/**
 * Seed a read-only field form from a lightweight catalog row. Used for locked rows
 * (System / Platform / foreign-Global) that have no fetchable FieldDefinition — the sheet
 * renders disabled, so the fields the row omits show their empty state.
 */
export function buildFormFromCatalogRow(row: FieldCatalogRowDto): FieldForm {
  return {
    object: row.objectType,
    location: row.location,
    fieldKey: row.fieldKey,
    displayName: row.displayName,
    fieldType: row.fieldType,
    category: 'WorkspaceLocal',
    section: '',
    isRequired: row.isRequired,
    minValue: '',
    maxValue: '',
    visibleStages: [],
    options: [],
    rules: [],
    expression: '',
    defaultValue: '',
  };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `cd web && npx jest src/features/fields/fieldForm.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `lockMessageForSource`**

Add to `web/src/features/fields/constants.test.ts`:

```ts
import { lockMessageForSource } from './constants';

it('lockMessageForSource — each source — returns the matching lock copy', () => {
  // Assert
  expect(lockMessageForSource('System')).toMatch(/system field/i);
  expect(lockMessageForSource('Platform')).toMatch(/platform-defined field/i);
  expect(lockMessageForSource('User')).toMatch(/global field owned by a workspace/i);
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `cd web && npx jest src/features/fields/constants.test.ts -t lockMessageForSource`
Expected: FAIL — not exported.

- [ ] **Step 7: Implement `lockMessageForSource`**

Append to `web/src/features/fields/constants.ts` (import `FieldSource` from `@shared/types` if not already):

```ts
/**
 * The lock-banner copy shown when a locked field opens read-only, keyed on its provenance.
 * (Moved verbatim out of the deleted FieldReadOnlySheet.) A read-only 'User' row is a foreign
 * Global field surfaced from the owning workspace.
 */
export function lockMessageForSource(source: FieldSource): string {
  if (source === 'System') {
    return 'This is a system field, provisioned automatically on every object. It can’t be edited, archived, or deleted.';
  }
  if (source === 'Platform') {
    return 'This is a platform-defined field managed centrally. It can’t be edited here.';
  }
  return 'This is a global field owned by a workspace. It can only be changed from the workspace that created it.';
}
```

- [ ] **Step 8: Run the two test files and confirm both pass**

Run: `cd web && npx jest src/features/fields/fieldForm.test.ts src/features/fields/constants.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/features/fields/fieldForm.ts web/src/features/fields/fieldForm.test.ts web/src/features/fields/constants.ts web/src/features/fields/constants.test.ts
git commit -m "feat(fields): add read-only form seed + lock-message helpers"
```

---

### Task 2: `FieldEditorSheet` gains a read-only mode (banner + disabled controls + CLOSE)

**Files:**
- Modify: `web/src/features/fields/components/FieldEditorSheet.tsx`
- Modify: `web/src/features/fields/components/TypeAndCategoryFields.tsx`
- Modify: `web/src/features/fields/components/FieldEditorExtras.tsx`
- Modify: `web/src/features/fields/components/OptionsEditor.tsx`
- Modify: `web/src/features/fields/components/RulesEditor.tsx`
- Test: `web/src/features/fields/components/FieldEditorSheet.test.tsx`

**Interfaces:**
- Consumes: `buildFormFromCatalogRow`, `lockMessageForSource` (Task 1), `FieldForm` (existing).
- Produces: `FieldEditorSheet` accepts new props `readOnly?: boolean` (default false), `lockMessage?: string`, `readOnlyForm?: FieldForm`. When `readOnly`, the sheet seeds from `readOnlyForm`, titles `Edit {displayName}`, shows the lock banner, disables every control, and renders a single **Close** footer. Sub-components accept `disabled?: boolean`.

- [ ] **Step 1: Thread `disabled` into the four sub-components**

`TypeAndCategoryFields.tsx` — add `disabled?: boolean` to `TypeAndCategoryFieldsProps`, destructure it, and add `disabled={disabled}` to both `<select>` elements.

`OptionsEditor.tsx` — add `disabled?: boolean` to `OptionsEditorProps`, destructure (default `false`); add `disabled={disabled}` to both `<input>`s, the remove `IconButton`, and the "Add option" `Button`.

`RulesEditor.tsx` — add `disabled?: boolean` to `RulesEditorProps`, destructure (default `false`); add `disabled={disabled}` to the three `<select>`s, the value `<input>`, the remove `IconButton`, and the "Add rule" `Button`.

`FieldEditorExtras.tsx` — add `disabled?: boolean` to `FieldEditorExtrasProps`, destructure (default `false`); add `disabled={disabled}` to the min/max `<input>`s, the Calculation expression `<input>`, the DerivedCategory default `<input>`, and each stage-visibility checkbox; pass `disabled={disabled}` down to `<OptionsEditor … disabled={disabled} />`.

- [ ] **Step 2: Write the failing read-only render test**

Replace/extend `web/src/features/fields/components/FieldEditorSheet.test.tsx` with a read-only case:

```tsx
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { FieldEditorSheet } from './FieldEditorSheet';
import { buildFormFromCatalogRow } from '../fieldForm';
import { lockMessageForSource } from '../constants';
import type { FieldCatalogRowDto } from '@shared/types';

const lockedRow: FieldCatalogRowDto = {
  id: 'system:Request:recordId', objectType: 'Request', objectLabel: 'Request',
  fieldKey: 'recordId', displayName: 'Record ID', fieldType: 'ShortText',
  location: 'Global', isRequired: true, source: 'System', status: 'Active', isReadOnly: true,
};

function renderReadOnly() {
  return render(
    <FieldEditorSheet
      initialObjectType="Request"
      field={null}
      readOnly
      readOnlyForm={buildFormFromCatalogRow(lockedRow)}
      lockMessage={lockMessageForSource(lockedRow.source)}
      availableKeysByObject={{}}
      saveError={null}
      isSaving={false}
      onSave={() => {}}
      onClose={() => {}}
    />,
  );
}

it('FieldEditorSheet — read-only — titles "Edit {name}", shows lock banner, no Save', () => {
  // Arrange / Act
  renderReadOnly();

  // Assert
  expect(screen.getByRole('heading', { name: 'Edit Record ID' })).toBeInTheDocument();
  expect(screen.getByRole('note')).toHaveTextContent(/system field/i);
  expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /save field/i })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Display name') as HTMLInputElement).toBeDisabled();
});

it('FieldEditorSheet — read-only — has no axe violations', async () => {
  // Arrange
  const { container } = renderReadOnly();
  // Act
  const results = await axe(container);
  // Assert
  expect(results).toHaveNoViolations();
});
```

> Note: `getByLabelText('Display name')` relies on the existing `<label>`/`<span class="caption">` association. If the existing markup doesn't associate them for RTL, assert the disabled state via `screen.getByDisplayValue('Record ID')` instead. Keep the existing editable-mode tests in this file passing.

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd web && npx jest src/features/fields/components/FieldEditorSheet.test.tsx -t "read-only"`
Expected: FAIL — `readOnly` prop unsupported; heading says "Add field"; a Save button is present.

- [ ] **Step 4: Implement read-only mode in `FieldEditorSheet.tsx`**

Add `LockSimple` to the phosphor import. Update the props interface and body:

```tsx
interface FieldEditorSheetProps {
  initialObjectType: FieldObjectType;
  field: FieldDefinitionDto | null;
  availableKeysByObject: Partial<Record<FieldObjectType, string[]>>;
  saveError: string | null;
  isSaving: boolean;
  onSave: (fieldKey: string, request: FieldDefinitionUpsertRequest, isCreate: boolean) => void;
  onArchive?: (() => void) | undefined;
  isArchiving?: boolean | undefined;
  onClose: () => void;
  /** When true, every control is disabled, a lock banner shows, and the footer is CLOSE-only. */
  readOnly?: boolean;
  /** Lock-banner copy (source-keyed). Shown only when readOnly. */
  lockMessage?: string;
  /** Seed form for a locked row that has no fetchable definition (System / foreign-Global). */
  readOnlyForm?: FieldForm;
}
```

In the component:

```tsx
  readOnly = false,
  lockMessage,
  readOnlyForm,
  // …
  const isCreate = !readOnly && field === null;
  const [form, setForm] = useState<FieldForm>(() =>
    readOnly && readOnlyForm
      ? readOnlyForm
      : buildInitialForm(field, initialObjectType, FIELD_TYPE_OPTIONS),
  );
```

Heading:

```tsx
{readOnly ? `Edit ${form.displayName}` : isCreate ? 'Add field' : `Edit ${field.displayName}`}
```

Lock banner — immediately after the `saveError` block inside the `<form>`:

```tsx
{readOnly && lockMessage && (
  <p className="mws-alert mws-alert--info fields-sheet__lock" role="note">
    <LockSimple size={16} aria-hidden /> {lockMessage}
  </p>
)}
```

Disable controls: add `readOnly` to each disabled expression —
- Display name input: `disabled={readOnly}`
- Field key input: `disabled={readOnly || !isCreate}`
- Object select: `disabled={readOnly || !isCreate}`
- Location select: `disabled={readOnly}`
- Section input: `disabled={readOnly}`
- Required checkbox: `disabled={readOnly}`
- `<TypeAndCategoryFields … disabled={readOnly} />`
- `<FieldEditorExtras … disabled={readOnly} />`
- `<RulesEditor … disabled={readOnly} />`

Footer:

```tsx
<footer className="fields-sheet__footer">
  {readOnly ? (
    <>
      <span className="fields-sheet__footer-spacer" />
      <Button variant="secondary" onClick={onClose}>
        Close
      </Button>
    </>
  ) : (
    <>
      {field && !field.isRetired && onArchive && (
        <Button variant="secondary" onClick={onArchive} disabled={isArchiving}>
          {isArchiving ? 'Archiving…' : 'Archive'}
        </Button>
      )}
      <span className="fields-sheet__footer-spacer" />
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" disabled={isSaving}>
        {isSaving ? 'Saving…' : 'Save field'}
      </Button>
    </>
  )}
</footer>
```

(`patch`/`submit` stay as-is — they're unreachable in read-only since inputs are disabled and no submit button renders.)

- [ ] **Step 5: Run the sheet tests and confirm they pass**

Run: `cd web && npx jest src/features/fields/components/FieldEditorSheet.test.tsx src/features/fields/components/OptionsEditor.test.tsx src/features/fields/components/RulesEditor.test.tsx`
Expected: PASS (editable-mode and read-only-mode).

- [ ] **Step 6: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors (note `exactOptionalPropertyTypes` — the new optional props are read, not spread with `undefined`).

- [ ] **Step 7: Commit**

```bash
git add web/src/features/fields/components/FieldEditorSheet.tsx web/src/features/fields/components/FieldEditorSheet.test.tsx web/src/features/fields/components/TypeAndCategoryFields.tsx web/src/features/fields/components/FieldEditorExtras.tsx web/src/features/fields/components/OptionsEditor.tsx web/src/features/fields/components/RulesEditor.tsx
git commit -m "feat(fields): read-only mode for FieldEditorSheet (lock banner, disabled, CLOSE)"
```

---

### Task 3: Route workspace catalog locked rows to the shared read-only sheet

**Files:**
- Modify: `web/src/features/fields/components/FieldsCatalogTab.tsx`
- Test: `web/src/features/fields/components/FieldsCatalogTab.test.tsx`

**Interfaces:**
- Consumes: `FieldEditorSheet` read-only mode (Task 2), `buildFormFromCatalogRow`, `lockMessageForSource` (Task 1).
- Produces: clicking a locked row opens `FieldEditorSheet` in read-only mode (not `FieldReadOnlySheet`).

- [ ] **Step 1: Update the read-only branch test**

In `web/src/features/fields/components/FieldsCatalogTab.test.tsx`, find the test that asserts opening a locked row and update it to expect the unified sheet — heading `Edit {name}`, the lock `note`, and a `Close` button; assert no `Save field`. Keep the editable-row test as-is. Ensure a jest-axe assertion covers the read-only-open state.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && npx jest src/features/fields/components/FieldsCatalogTab.test.tsx`
Expected: FAIL — still renders the old read-only sheet (no "Edit" prefix / different structure).

- [ ] **Step 3: Replace the read-only render path**

In `FieldsCatalogTab.tsx`: remove the `FieldReadOnlySheet` import; add `import { buildFormFromCatalogRow } from '../fieldForm';` and `lockMessageForSource` to the existing `../constants` import (add the import line if none exists). Replace the read-only render block:

```tsx
{editor?.mode === 'readonly' && (
  <FieldEditorSheet
    initialObjectType={editor.row.objectType}
    field={null}
    readOnly
    readOnlyForm={buildFormFromCatalogRow(editor.row)}
    lockMessage={lockMessageForSource(editor.row.source)}
    availableKeysByObject={availableKeysByObject}
    saveError={null}
    isSaving={false}
    onSave={onSave}
    onClose={closeEditor}
  />
)}
```

(`onSave` is passed but never invoked in read-only — no submit button renders. Leaving the existing `onSave` avoids a throwaway noop.)

- [ ] **Step 4: Run it and confirm it passes**

Run: `cd web && npx jest src/features/fields/components/FieldsCatalogTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/fields/components/FieldsCatalogTab.tsx web/src/features/fields/components/FieldsCatalogTab.test.tsx
git commit -m "feat(fields): workspace catalog opens locked rows in the unified read-only sheet"
```

---

### Task 4: Route platform catalog locked rows to the shared read-only sheet

**Files:**
- Modify: `web/src/features/fields/components/PlatformFieldsCatalogTab.tsx`
- Test: `web/src/features/fields/components/PlatformFieldsCatalogTab.test.tsx`

**Interfaces:**
- Consumes: `FieldEditorSheet` read-only mode, `buildFormFromCatalogRow`, `lockMessageForSource`.
- Produces: platform locked rows open the same unified read-only `FieldEditorSheet`; editable platform rows still open `PlatformFieldEditorSheet` (unchanged).

- [ ] **Step 1: Update the read-only branch test**

In `PlatformFieldsCatalogTab.test.tsx`, update the locked-row test to expect the unified sheet (heading `Edit {name}`, lock `note`, `Close`, no `Save field`). Keep the editable-platform-row test asserting `PlatformFieldEditorSheet` behavior. Include a jest-axe assertion on the read-only-open state.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && npx jest src/features/fields/components/PlatformFieldsCatalogTab.test.tsx`
Expected: FAIL — still renders the old read-only sheet.

- [ ] **Step 3: Replace the read-only render path**

In `PlatformFieldsCatalogTab.tsx`: remove the `FieldReadOnlySheet` import; add `import { FieldEditorSheet } from './FieldEditorSheet';`, `import { buildFormFromCatalogRow } from '../fieldForm';`, and `import { lockMessageForSource } from '../constants';`. Replace the `readonlyRow` render:

```tsx
{readonlyRow && (
  <FieldEditorSheet
    initialObjectType={readonlyRow.objectType}
    field={null}
    readOnly
    readOnlyForm={buildFormFromCatalogRow(readonlyRow)}
    lockMessage={lockMessageForSource(readonlyRow.source)}
    availableKeysByObject={{}}
    saveError={null}
    isSaving={false}
    onSave={() => {}}
    onClose={() => setReadonlyRow(null)}
  />
)}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `cd web && npx jest src/features/fields/components/PlatformFieldsCatalogTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/fields/components/PlatformFieldsCatalogTab.tsx web/src/features/fields/components/PlatformFieldsCatalogTab.test.tsx
git commit -m "feat(fields): platform catalog opens locked rows in the unified read-only sheet"
```

---

### Task 5: Delete `FieldReadOnlySheet`

**Files:**
- Delete: `web/src/features/fields/components/FieldReadOnlySheet.tsx`
- Delete: `web/src/features/fields/components/FieldReadOnlySheet.test.tsx`
- Modify (optional cleanup): `web/src/features/fields/fields.css` (remove now-orphaned `.fields-readonly` rules)

**Interfaces:**
- Consumes: nothing after Tasks 3–4 removed both importers.

- [ ] **Step 1: Confirm no remaining importers**

Run: `cd web && grep -rn "FieldReadOnlySheet" src`
Expected: no matches (Tasks 3 and 4 removed both). If any remain, fix them before deleting.

- [ ] **Step 2: Delete the component and its test**

```bash
git rm web/src/features/fields/components/FieldReadOnlySheet.tsx web/src/features/fields/components/FieldReadOnlySheet.test.tsx
```

- [ ] **Step 3: Remove orphaned CSS (optional)**

In `web/src/features/fields/fields.css`, delete the `.fields-readonly` and `.fields-readonly__row` rule blocks (only `FieldReadOnlySheet` used them). Leave `.fields-sheet__lock` — still used by the banner.

- [ ] **Step 4: Full fields suite + type-check**

Run: `cd web && npx tsc --noEmit && npx jest src/features/fields`
Expected: PASS, no dangling references.

- [ ] **Step 5: Commit**

```bash
git add -A web/src/features/fields
git commit -m "refactor(fields): remove FieldReadOnlySheet (superseded by unified read-only sheet)"
```

---

### Task 6: Align the Objects lock banner with the Fields banner

**Files:**
- Modify: `web/src/features/objects/components/ObjectEditorSheet.tsx`
- Test: `web/src/features/objects/components/ObjectEditorSheet.test.tsx`

**Interfaces:**
- Produces: the built-in-object lock banner uses the same info style + leading `LockSimple` icon as the Fields banner (`fields-sheet__lock`). No behavior change.

- [ ] **Step 1: Update the banner test**

In `ObjectEditorSheet.test.tsx`, in the read-only (built-in object) test, assert the banner is present as a `note` with the built-in copy (unchanged text) — and, if the test already checks structure, allow the lock icon. Keep the existing read-only behavior assertions (Close-only footer, disabled inputs) passing. Ensure the jest-axe assertion still runs on the read-only state.

- [ ] **Step 2: Run it and confirm current state**

Run: `cd web && npx jest src/features/objects/components/ObjectEditorSheet.test.tsx`
Expected: PASS before the change (baseline) — the test edit in Step 1 should be additive/compatible; if you asserted the icon, it FAILS until Step 3.

- [ ] **Step 3: Add the lock icon + shared class**

Add `LockSimple` to the phosphor import in `ObjectEditorSheet.tsx`. Update the read-only banner:

```tsx
{readOnly && (
  <p className="mws-alert mws-alert--info fields-sheet__lock" role="note">
    <LockSimple size={16} aria-hidden /> This is a built-in object. Its definition is managed by
    the platform and can’t be edited here.
  </p>
)}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `cd web && npx jest src/features/objects/components/ObjectEditorSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/objects/components/ObjectEditorSheet.tsx web/src/features/objects/components/ObjectEditorSheet.test.tsx
git commit -m "style(objects): align built-in lock banner with the Fields lock banner"
```

---

## Deferred (out of scope — flag at handoff, don't silently drop)

The prototype's field-edit modal also differs from the *editable* built sheet in ways this plan intentionally does **not** change (they'd touch the create/edit flow and its data, not just the locked view): pairing Type|Object and Location|Section, hiding the **Category** select, and rendering **Required** as a toggle switch instead of a checkbox. Because the sheet is one component, editable and locked stay identical either way — the "same for all fields" goal holds. These are a separate prototype-fidelity pass; the project's design-fidelity gate is waived for the DCLogic prototype, so nothing forces them here. Note for the reviewer to decide.

## Self-Review

- **Spec coverage:** §1 FieldEditorSheet readOnly → Task 2. §2 FieldsCatalogTab routing → Task 3. §3 delete FieldReadOnlySheet → Task 5. §4 platform catalog → Task 4 (refined: reuse the shared read-only `FieldEditorSheet` rather than adding a readOnly branch to `PlatformFieldEditorSheet`, since locked platform rows are heterogeneous `FieldCatalogRowDto`s, not `PlatformFieldDto`s — cleaner and truly unified). §5 Objects banner → Task 6. Risk (no fetch for locked rows) → resolved by Task 1's `buildFormFromCatalogRow`.
- **Placeholder scan:** none — every step carries real code or a concrete command.
- **Type consistency:** `buildFormFromCatalogRow` / `lockMessageForSource` names and signatures match across Tasks 1, 3, 4; `FieldForm` fields match `fieldForm.ts`; new `FieldEditorSheet` props (`readOnly`, `lockMessage`, `readOnlyForm`) consistent across Tasks 2–4; sub-component `disabled` prop consistent in Task 2.
