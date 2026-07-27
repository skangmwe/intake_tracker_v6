# Export Field Dual-List Transfer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Export tab's checkbox field picker with a McDermott dual-list "shuttle" transfer (Available ⟷ Selected) that supports move buttons, click/double-click, multi-select, per-column filters, and drag-to-reorder the Selected column — and make the CSV honor that column order.

**Architecture:** New `ExportFieldTransfer` React component drives an ordered `string[]` selection in `ExportWizard` (replacing a `Set`). The export request already carries `fieldKeys` as an array; the only backend change is `ExportService` emitting columns in the request's order (identity fields first) instead of registry order.

**Tech Stack:** React 19 + TypeScript, SCSS-less plain CSS module classes in `importExport.css`, Phosphor icons, Jest + RTL + jest-axe, Playwright; ASP.NET Core + xUnit + Moq for the API.

## Global Constraints

- **Worktree:** all work is in `.claude/worktrees/export-field-transfer`. Every git command runs as `git -C .claude/worktrees/export-field-transfer …`. Direct `git commit` is blocked; `git -C <worktree> commit` bypasses it — never create a `.commit-allowed` token. All tool paths stay inside the worktree.
- **Edit-time gates:** web → from `web/`, `npx tsc --noEmit` clean (baseline: `dev` ships 20 pre-existing tsc errors in unrelated files — ask/relationships/audit/Sidebar.test; the gate is **no NEW errors**). api → from `api/`, `dotnet build` clean. Don't run full lint/jest/dotnet test mid-task beyond the scoped tests below; the slice-completion gate runs them.
- **Commit trailer:** end every commit body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **No new dependencies.** Drag-and-drop is native HTML5 DnD (`draggable`/`onDragStart`/`onDragOver`/`onDrop`). No @dnd-kit, no libraries.
- **Design system:** all colors/radii via McDermott tokens (`var(--…)`) — never raw hex/rgb/named colors or off-spec radii (design-conformance gate blocks them). Phosphor **regular** weight icons at sizes 16/20 only. `data-ds="field-transfer"` on the component root.
- **Accessibility (hard):** two `role="listbox"` with `aria-multiselectable="true"`; options carry `aria-selected`; move buttons + filter inputs have accessible names; drag-reorder MUST have a keyboard equivalent (**Alt+ArrowUp/ArrowDown** on a focused Selected item); `jest-axe` on every meaningfully different state. Locked identity fields can't be removed or reordered.
- **Rules to read before coding:** web → `.claude/rules/dev/web-component-architecture.md`, `web-coding-standards.md`, `web-styling.md`, `web-testing.md`, `.claude/rules/design/accessibility.md`, `.claude/rules/design/forms-and-input.md`. api → `.claude/rules/dev/api-coding-standards.md`, `api-testing-guidelines.md`.
- **`IoFieldSpec`** (`shared/types/imports.ts`): `{ key: string; label: string; required?: boolean; alwaysIncluded?: boolean }`. Identity/locked = `alwaysIncluded === true`.

---

### Task 1: API — export columns follow the requested `fieldKeys` order

Make `ExportService` emit CSV columns in the caller's order (identity fields first, registry order among themselves; then the requested non-identity fields in exactly the order sent). No DTO/signature change.

**Files:**
- Modify: `api/Api/Modules/ImportExport/ExportService.cs` (the columns-build block, currently ~lines 99-106 in `ExportObjectAsync`)
- Modify: `api/Api.Tests/ExportServiceTests.cs` (add ordering tests; keep existing ones)

**Interfaces:**
- Consumes: `ExportObjectAsync(Guid workspaceId, string? objectType, IReadOnlyList<string>? fieldKeys, Guid userId, CancellationToken)` — unchanged signature; `fieldKeys` is now honored as an ordered list.
- Produces: CSV whose columns are `[identity fields in registry order] ++ [requested non-identity fields in request order]`.

- [ ] **Step 1: Write the failing test**

In `api/Api.Tests/ExportServiceTests.cs`, add a helper that registers an object with more than one non-identity field and a test asserting the header order follows the request. Model it on the existing `SetupExportObject` / `ExportObjectAsync_HappyPath_IncludesIdentityColumnAndSelectedFields` tests. Add:

```csharp
    /// <summary>Register a Request-like object with id (identity) + three orderable columns.</summary>
    private void SetupOrderableObject()
    {
        var ioObject = new Mock<IIoObject>();
        ioObject.SetupGet(item => item.ObjectType).Returns("Request");
        ioObject.SetupGet(item => item.CanExport).Returns(true);
        var exportFields = new[]
        {
            new IoFieldSpec("id", "Record ID", AlwaysIncluded: true),
            new IoFieldSpec("alpha", "Alpha"),
            new IoFieldSpec("beta", "Beta"),
            new IoFieldSpec("gamma", "Gamma"),
        };
        ioObject.Setup(item => item.GetExportFieldsAsync(WorkspaceId, It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(exportFields);
        ioObject.Setup(item => item.BuildExportAsync(WorkspaceId, It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ExportDataset(exportFields, new IReadOnlyDictionary<string, object?>[]
            {
                new Dictionary<string, object?> { ["id"] = "AIS-1", ["alpha"] = "a", ["beta"] = "b", ["gamma"] = "g" },
            }));
        _registry.Setup(registry => registry.FindForWorkspaceAsync(WorkspaceId, "Request", It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(ioObject.Object);
    }

    private static string HeaderLine(byte[] csvBytes)
    {
        // Strip the UTF-8 BOM the writer prepends, then take the first line.
        var text = Encoding.UTF8.GetString(csvBytes);
        return text.TrimStart('﻿').Split('\n')[0].TrimEnd('\r');
    }

    [Fact]
    public async Task ExportObjectAsync_ColumnsFollowRequestedOrder_IdentityFirst()
    {
        // Arrange
        SetupOrderableObject();
        _accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        var service = Build();

        // Act — request gamma, then alpha (deliberately not registry order; beta omitted).
        var result = await service.ExportObjectAsync(WorkspaceId, "Request", new[] { "gamma", "alpha" }, UserId, CancellationToken.None);

        // Assert — identity ("Record ID") first, then the requested fields in the requested order.
        Assert.Equal(ExportOutcome.Success, result.Outcome);
        Assert.Equal("Record ID,Gamma,Alpha", HeaderLine(result.Content!));
    }

    [Fact]
    public async Task ExportObjectAsync_IdentityKeyInRequest_NotDuplicated()
    {
        // Arrange
        SetupOrderableObject();
        _accessGuard.Setup(guard => guard.HasWorkspaceLevelAsync(UserId, WorkspaceId, WorkspaceLevel.Viewer, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        var service = Build();

        // Act — caller redundantly includes the identity key "id".
        var result = await service.ExportObjectAsync(WorkspaceId, "Request", new[] { "id", "beta" }, UserId, CancellationToken.None);

        // Assert — identity appears once, at the front.
        Assert.Equal(ExportOutcome.Success, result.Outcome);
        Assert.Equal("Record ID,Beta", HeaderLine(result.Content!));
    }
```

Note: confirm the `ExportResult` field that holds the bytes (used above as `result.Content`) by reading `ExportService.cs` / the `ExportResult` record — use its real property name (it is BOM-encoded via `EncodeWithBom`). Adjust `HeaderLine(result.<bytesProp>!)` accordingly.

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `api/`): `dotnet test Api.Tests --filter "FullyQualifiedName~ExportServiceTests.ExportObjectAsync_ColumnsFollowRequestedOrder_IdentityFirst|FullyQualifiedName~ExportServiceTests.ExportObjectAsync_IdentityKeyInRequest_NotDuplicated"`
Expected: FAIL — current code orders by registry (`Record ID,Alpha,Gamma`), not request order.

- [ ] **Step 3: Reorder the columns build**

In `ExportService.cs`, replace the current block:

```csharp
        // Identity columns are always emitted (even if unchecked); order follows the object's field list.
        var columns = exportFields
            .Where(field => field.AlwaysIncluded || requested.Contains(field.Key))
            .ToList();
        if (columns.Count == 0)
        {
            return new ExportResult(ExportOutcome.Unsupported);
        }
```

with:

```csharp
        // Identity columns are always emitted first, in the object's field order. The remaining columns
        // follow the caller's requested order (the export wizard's Selected-column order), de-duped
        // against identity so a redundant identity key in the request never doubles the column.
        var identity = exportFields.Where(field => field.AlwaysIncluded).ToList();
        var identityKeys = new HashSet<string>(identity.Select(field => field.Key), StringComparer.Ordinal);
        var byKey = exportFields.ToDictionary(field => field.Key, StringComparer.Ordinal);
        var selectedColumns = (fieldKeys ?? Array.Empty<string>())
            .Where(key => !identityKeys.Contains(key) && byKey.ContainsKey(key))
            .Select(key => byKey[key]);
        var columns = identity.Concat(selectedColumns).ToList();
        if (columns.Count == 0)
        {
            return new ExportResult(ExportOutcome.Unsupported);
        }
```

The `requested.IsSubsetOf(exportKeys)` validation ABOVE this block is unchanged (unknown key → `Unsupported`). `CsvExportWriter.WriteDataset(columns, ...)` already renders in `columns` order — leave it.

- [ ] **Step 4: Run the new tests + the existing export tests to verify green**

Run (from `api/`): `dotnet test Api.Tests --filter "FullyQualifiedName~ExportServiceTests"`
Expected: PASS — the two new tests plus all existing ones (`_HappyPath_IncludesIdentityColumnAndSelectedFields`, `_IdentityOnly_StillExports`, `_UnknownFieldKey_ReturnsUnsupported`, etc.).

- [ ] **Step 5: Build check**

Run (from `api/`): `dotnet build Api` — clean.

- [ ] **Step 6: Commit**

```bash
git -C .claude/worktrees/export-field-transfer add api/Api/Modules/ImportExport/ExportService.cs api/Api.Tests/ExportServiceTests.cs
git -C .claude/worktrees/export-field-transfer commit -m "feat(export): emit CSV columns in the requested field order

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Web — the `ExportFieldTransfer` dual-list component

The core deliverable. A self-contained component with move/filter/reorder logic and full a11y, plus its unit tests. Not yet wired into the wizard (Task 3).

**Files:**
- Create: `web/src/features/import-export/components/ExportFieldTransfer.tsx`
- Create: `web/src/features/import-export/components/ExportFieldTransfer.test.tsx`
- Modify: `web/src/features/import-export/importExport.css` (add `.ie-transfer*` classes near the existing `.ie-fieldpicker` block ~line 279)

**Interfaces:**
- Consumes: `IoFieldSpec` from `@shared/types`; Phosphor icons; nothing from other tasks.
- Produces: `export function ExportFieldTransfer(props: { fields: IoFieldSpec[]; selectedKeys: string[]; onChange: (nextSelectedKeys: string[]) => void })`. `selectedKeys` is the ordered non-identity selection; identity (`alwaysIncluded`) fields are rendered locked at the top of Selected and are never in `selectedKeys`.

Interaction contract (implement exactly): single-click an item toggles its highlight (Ctrl/Cmd-click adds/removes from the highlight set; Shift-click is not required); **double-click** moves that item to the other side immediately; the center buttons move the currently-highlighted set; Move-all / Clear-all operate on the **filter-visible** unlocked items. Drag a Selected item onto another Selected item to reorder; **Alt+ArrowUp/ArrowDown** on a focused Selected item reorders it by one. Locked items never move or reorder.

- [ ] **Step 1: Write the failing tests**

Create `web/src/features/import-export/components/ExportFieldTransfer.test.tsx`:

```tsx
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { IoFieldSpec } from '@shared/types';

import { ExportFieldTransfer } from './ExportFieldTransfer';

const FIELDS: IoFieldSpec[] = [
  { key: 'id', label: 'Record ID', alwaysIncluded: true },
  { key: 'alpha', label: 'Alpha' },
  { key: 'beta', label: 'Beta' },
  { key: 'gamma', label: 'Gamma' },
];

// Controlled harness so onChange drives the rendered state, matching how the wizard uses it.
function Harness({ initial = [] as string[] }: { initial?: string[] }) {
  const [keys, setKeys] = useState<string[]>(initial);
  return <ExportFieldTransfer fields={FIELDS} selectedKeys={keys} onChange={setKeys} />;
}

function availableList() {
  return screen.getByRole('listbox', { name: /available/i });
}
function selectedList() {
  return screen.getByRole('listbox', { name: /selected/i });
}

describe('ExportFieldTransfer', () => {
  it('ExportFieldTransfer — default — identity locked in Selected, rest in Available', () => {
    // Arrange / Act
    render(<Harness />);

    // Assert
    expect(within(selectedList()).getByText('Record ID')).toBeInTheDocument();
    expect(within(availableList()).getByText('Alpha')).toBeInTheDocument();
    expect(within(availableList()).getByText('Beta')).toBeInTheDocument();
  });

  it('ExportFieldTransfer — double-click an available field — moves it to Selected', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);

    // Act
    await user.dblClick(within(availableList()).getByText('Beta'));

    // Assert
    expect(within(selectedList()).getByText('Beta')).toBeInTheDocument();
    expect(within(availableList()).queryByText('Beta')).not.toBeInTheDocument();
  });

  it('ExportFieldTransfer — select two then Move → — moves both', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);

    // Act
    await user.click(within(availableList()).getByText('Alpha'));
    await user.keyboard('{Control>}');
    await user.click(within(availableList()).getByText('Gamma'));
    await user.keyboard('{/Control}');
    await user.click(screen.getByRole('button', { name: /move selected right/i }));

    // Assert
    expect(within(selectedList()).getByText('Alpha')).toBeInTheDocument();
    expect(within(selectedList()).getByText('Gamma')).toBeInTheDocument();
  });

  it('ExportFieldTransfer — Move all / Clear all — respects locked identity', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);

    // Act — move everything, then clear.
    await user.click(screen.getByRole('button', { name: /move all right/i }));
    // Assert all three orderable fields moved.
    expect(within(selectedList()).getByText('Alpha')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear all/i }));

    // Assert — identity stays, orderable fields returned to Available.
    expect(within(selectedList()).getByText('Record ID')).toBeInTheDocument();
    expect(within(selectedList()).queryByText('Alpha')).not.toBeInTheDocument();
    expect(within(availableList()).getByText('Alpha')).toBeInTheDocument();
  });

  it('ExportFieldTransfer — filter Available — narrows the list', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);

    // Act
    await user.type(screen.getByRole('searchbox', { name: /filter available/i }), 'bet');

    // Assert
    expect(within(availableList()).getByText('Beta')).toBeInTheDocument();
    expect(within(availableList()).queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('ExportFieldTransfer — Alt+ArrowDown on a Selected field — moves it down one', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial={['alpha', 'beta']} />);

    // Act — focus Alpha (first orderable) and push it below Beta.
    const alpha = within(selectedList()).getByText('Alpha');
    alpha.focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    // Assert — Beta now precedes Alpha in the Selected list DOM order.
    const options = within(selectedList()).getAllByRole('option').map((el) => el.textContent);
    const betaIndex = options.findIndex((t) => t?.includes('Beta'));
    const alphaIndex = options.findIndex((t) => t?.includes('Alpha'));
    expect(betaIndex).toBeLessThan(alphaIndex);
  });

  it('ExportFieldTransfer — locked identity field — cannot be removed', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial={['alpha']} />);

    // Act — try to double-click the locked identity row.
    await user.dblClick(within(selectedList()).getByText('Record ID'));

    // Assert — still in Selected, never appears in Available.
    expect(within(selectedList()).getByText('Record ID')).toBeInTheDocument();
    expect(within(availableList()).queryByText('Record ID')).not.toBeInTheDocument();
  });

  it('ExportFieldTransfer — no axe violations across states', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    // Assert — default
    expect(await axe(container)).toHaveNoViolations();

    // Act — populate Selected + apply a filter, then re-check.
    await user.dblClick(within(availableList()).getByText('Alpha'));
    await user.type(screen.getByRole('searchbox', { name: /filter selected/i }), 'alp');

    // Assert — populated + filtered
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `web/`): `npx jest src/features/import-export/components/ExportFieldTransfer.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `web/src/features/import-export/components/ExportFieldTransfer.tsx`:

```tsx
// Export column transfer (S28 export wizard, step 2). A dual-list "shuttle": Available fields on the
// left, the Selected columns on the right, in the order they'll appear in the CSV. Identity fields
// (alwaysIncluded) are pinned locked at the top of Selected. Both lists are multi-select listboxes;
// items move via double-click, the center buttons (on the highlighted set), or Move-all / Clear-all.
// Selected fields reorder via native drag or Alt+Arrow keys (the keyboard-accessible equivalent).
// forms-and-input.md / accessibility.md: labelled listboxes, accessible-named controls, no color-only state.

import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretLeft,
  CaretRight,
  Lock,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import type { IoFieldSpec } from '@shared/types';

interface ExportFieldTransferProps {
  fields: IoFieldSpec[];
  /** Ordered, excludes identity (alwaysIncluded) keys — those are implicit and pinned. */
  selectedKeys: string[];
  onChange: (nextSelectedKeys: string[]) => void;
}

function labelMatches(field: IoFieldSpec, filter: string): boolean {
  return field.label.toLowerCase().includes(filter.trim().toLowerCase());
}

export function ExportFieldTransfer({ fields, selectedKeys, onChange }: ExportFieldTransferProps) {
  const byKey = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields]);
  const lockedFields = useMemo(
    () => fields.filter((field) => field.alwaysIncluded === true),
    [fields],
  );
  const availableFields = useMemo(
    () => fields.filter((field) => !field.alwaysIncluded && !selectedKeys.includes(field.key)),
    [fields, selectedKeys],
  );

  const [availFilter, setAvailFilter] = useState('');
  const [selFilter, setSelFilter] = useState('');
  const [availHi, setAvailHi] = useState<ReadonlySet<string>>(new Set());
  const [selHi, setSelHi] = useState<ReadonlySet<string>>(new Set());
  const [dragKey, setDragKey] = useState<string | null>(null);

  const availVisible = availableFields.filter((field) => labelMatches(field, availFilter));
  const selVisible = selectedKeys
    .map((key) => byKey.get(key))
    .filter((field): field is IoFieldSpec => Boolean(field))
    .filter((field) => labelMatches(field, selFilter));

  const addKeys = (keys: string[]) =>
    onChange([...selectedKeys, ...keys.filter((key) => !selectedKeys.includes(key))]);
  const removeKeys = (keys: string[]) =>
    onChange(selectedKeys.filter((key) => !keys.includes(key)));

  const toggleHighlight = (
    setHi: (updater: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void,
    key: string,
    additive: boolean,
  ) =>
    setHi((prev) => {
      const next = new Set(additive ? prev : []);
      if (prev.has(key) && (additive || prev.size === 1)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  const moveRight = () => {
    addKeys(availVisible.filter((field) => availHi.has(field.key)).map((field) => field.key));
    setAvailHi(new Set());
  };
  const moveLeft = () => {
    removeKeys(selVisible.filter((field) => selHi.has(field.key)).map((field) => field.key));
    setSelHi(new Set());
  };
  const moveAllRight = () => {
    addKeys(availVisible.map((field) => field.key));
    setAvailHi(new Set());
  };
  const clearAll = () => {
    removeKeys(selVisible.map((field) => field.key));
    setSelHi(new Set());
  };

  const reorderBy = (key: string, delta: number) => {
    const from = selectedKeys.indexOf(key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= selectedKeys.length) return;
    const next = [...selectedKeys];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  };
  const dropOnto = (overKey: string) => {
    if (!dragKey || dragKey === overKey) return;
    const from = selectedKeys.indexOf(dragKey);
    const to = selectedKeys.indexOf(overKey);
    if (from < 0 || to < 0) return;
    const next = [...selectedKeys];
    next.splice(from, 1);
    next.splice(to, 0, dragKey);
    onChange(next);
    setDragKey(null);
  };

  const onSelectedKeyDown = (event: KeyboardEvent<HTMLLIElement>, key: string) => {
    if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault();
      reorderBy(key, -1);
    } else if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      reorderBy(key, 1);
    }
  };

  return (
    <div className="ie-transfer" data-ds="field-transfer">
      {/* Available */}
      <div className="ie-transfer__col">
        <div className="ie-transfer__col-head" id="ie-transfer-avail-label">
          Available
        </div>
        <label className="ie-transfer__search">
          <MagnifyingGlass size={16} aria-hidden />
          <input
            type="search"
            className="ie-transfer__search-input"
            aria-label="Filter available fields"
            value={availFilter}
            onChange={(event) => setAvailFilter(event.target.value)}
          />
        </label>
        <ul
          className="ie-transfer__list"
          role="listbox"
          aria-multiselectable="true"
          aria-labelledby="ie-transfer-avail-label"
        >
          {availVisible.map((field) => (
            <li
              key={field.key}
              role="option"
              tabIndex={0}
              aria-selected={availHi.has(field.key)}
              className={
                availHi.has(field.key) ? 'ie-transfer__item ie-transfer__item--hi' : 'ie-transfer__item'
              }
              onClick={(event) => toggleHighlight(setAvailHi, field.key, event.ctrlKey || event.metaKey)}
              onDoubleClick={() => addKeys([field.key])}
            >
              {field.label}
            </li>
          ))}
        </ul>
      </div>

      {/* Controls */}
      <div className="ie-transfer__controls" role="group" aria-label="Move fields">
        <button type="button" className="btn btn-icon" aria-label="Move selected right" onClick={moveRight}>
          <CaretRight size={16} aria-hidden />
        </button>
        <button type="button" className="btn btn-icon" aria-label="Move all right" onClick={moveAllRight}>
          <CaretDoubleRight size={16} aria-hidden />
        </button>
        <button type="button" className="btn btn-icon" aria-label="Remove selected" onClick={moveLeft}>
          <CaretLeft size={16} aria-hidden />
        </button>
        <button type="button" className="btn btn-icon" aria-label="Clear all" onClick={clearAll}>
          <CaretDoubleLeft size={16} aria-hidden />
        </button>
      </div>

      {/* Selected */}
      <div className="ie-transfer__col">
        <div className="ie-transfer__col-head" id="ie-transfer-sel-label">
          Selected
        </div>
        <label className="ie-transfer__search">
          <MagnifyingGlass size={16} aria-hidden />
          <input
            type="search"
            className="ie-transfer__search-input"
            aria-label="Filter selected fields"
            value={selFilter}
            onChange={(event) => setSelFilter(event.target.value)}
          />
        </label>
        <ul
          className="ie-transfer__list"
          role="listbox"
          aria-multiselectable="true"
          aria-labelledby="ie-transfer-sel-label"
        >
          {lockedFields
            .filter((field) => labelMatches(field, selFilter))
            .map((field) => (
              <li
                key={field.key}
                role="option"
                aria-selected={false}
                aria-disabled="true"
                className="ie-transfer__item ie-transfer__item--locked"
              >
                <Lock size={16} aria-hidden /> {field.label}
                <span className="ie-transfer__note"> (always included)</span>
              </li>
            ))}
          {selVisible.map((field) => (
            <li
              key={field.key}
              role="option"
              tabIndex={0}
              aria-selected={selHi.has(field.key)}
              draggable
              className={
                selHi.has(field.key) ? 'ie-transfer__item ie-transfer__item--hi' : 'ie-transfer__item'
              }
              onClick={(event) => toggleHighlight(setSelHi, field.key, event.ctrlKey || event.metaKey)}
              onDoubleClick={() => removeKeys([field.key])}
              onKeyDown={(event) => onSelectedKeyDown(event, field.key)}
              onDragStart={() => setDragKey(field.key)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropOnto(field.key)}
            >
              {field.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the CSS**

Append to `web/src/features/import-export/importExport.css` (all values via tokens; 2px radius; borders `--border-light`):

```css
.ie-transfer {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: var(--space-4);
}
.ie-transfer__col {
  flex: 1 1 260px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  background: var(--bg-surface);
  padding: var(--space-3);
}
.ie-transfer__col-head {
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.ie-transfer__search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  padding: 0 var(--space-3);
  color: var(--text-secondary);
}
.ie-transfer__search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  height: var(--control-h-sm);
  color: var(--text-primary);
}
.ie-transfer__search-input:focus-visible {
  outline: none;
}
.ie-transfer__list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  max-height: 320px;
  min-height: 120px;
}
.ie-transfer__item {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  cursor: pointer;
  color: var(--text-primary);
}
.ie-transfer__item:hover {
  background: var(--color-pale-blue);
  color: var(--color-navy);
}
.ie-transfer__item--hi {
  background: var(--color-pale-blue);
  color: var(--color-navy);
}
.ie-transfer__item:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.ie-transfer__item--locked {
  cursor: default;
  color: var(--text-secondary);
}
.ie-transfer__note {
  color: var(--text-secondary);
  font-size: 12px;
}
.ie-transfer__controls {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-2);
}
@media (max-width: 640px) {
  .ie-transfer__controls {
    flex-direction: row;
    justify-content: center;
  }
}
```

Confirm `--control-h-sm`, `.btn`, and `.btn-icon` exist (grep `web/src/mws/`); if `.btn-icon` isn't a shared class, use the project's icon-button pattern (match how other icon-only buttons are rendered in this feature/design system) — do not invent new colors.

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `web/`): `npx jest src/features/import-export/components/ExportFieldTransfer.test.tsx`
Expected: PASS. Fix real failures (e.g., accessible-name mismatches) by adjusting the component's `aria-label`s or the test queries to agree — keep the labels human-readable.

- [ ] **Step 6: Type-check**

Run (from `web/`): `npx tsc --noEmit` — no NEW errors beyond the 20 baseline.

- [ ] **Step 7: Commit**

```bash
git -C .claude/worktrees/export-field-transfer add web/src/features/import-export/components/ExportFieldTransfer.tsx web/src/features/import-export/components/ExportFieldTransfer.test.tsx web/src/features/import-export/importExport.css
git -C .claude/worktrees/export-field-transfer commit -m "feat(export): dual-list field transfer component with drag-reorder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Web — wire the transfer into the Export wizard

Swap the wizard's `Set` selection for an ordered array, render `ExportFieldTransfer`, and remove the old `ExportFieldPicker`.

**Files:**
- Modify: `web/src/features/import-export/components/ExportWizard.tsx`
- Modify: `web/src/features/import-export/components/ExportWizard.test.tsx`
- Delete: `web/src/features/import-export/components/ExportFieldPicker.tsx`, `web/src/features/import-export/components/ExportFieldPicker.test.tsx`
- Check: `web/src/features/import-export/index.ts` / any barrel that exports `ExportFieldPicker` — drop that export if present.

**Interfaces:**
- Consumes: `ExportFieldTransfer` (Task 2).
- Produces: `ExportWizard` sends `fieldKeys` in the user's Selected order to `useExportObject`.

- [ ] **Step 1: Update the wizard test first**

In `ExportWizard.test.tsx`, replace checkbox-picker assertions with transfer-based ones. Add a case proving order propagates: seed an object with ≥2 orderable fields, move two into Selected, reorder them (Alt+ArrowDown or drag), click through to Export, and assert the export mutation was called with `fieldKeys` in the Selected order. Match how the file currently mocks `useExportObject` / `useIoObjects` (read it first). Skeleton:

```tsx
it('ExportWizard — reordered selection — exports fieldKeys in Selected order', async () => {
  // Arrange — object with id (identity) + alpha, beta orderable; mock useIoObjects + capture useExportObject.mutate.
  // (reuse this file's existing mock setup for useIoObjects/useExportObject)

  // Act — step to Fields, move beta then alpha into Selected, reorder so alpha leads, step to Download, Export.

  // Assert
  expect(mutateMock).toHaveBeenCalledWith(
    expect.objectContaining({ objectType: 'Request', fieldKeys: ['alpha', 'beta'] }),
  );
});
```

Keep the existing object-select and step-navigation tests; only the field-step assertions change.

- [ ] **Step 2: Run to verify failure**

Run (from `web/`): `npx jest src/features/import-export/components/ExportWizard.test.tsx`
Expected: FAIL (transfer not wired yet).

- [ ] **Step 3: Wire the wizard**

In `ExportWizard.tsx`:
- Replace the import `import { ExportFieldPicker } from './ExportFieldPicker';` with `import { ExportFieldTransfer } from './ExportFieldTransfer';`.
- Replace `const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());` with `const [selectedKeys, setSelectedKeys] = useState<string[]>([]);`.
- In `chooseObject`, replace `setSelected(new Set())` with `setSelectedKeys([])`.
- Delete the `toggleField` function.
- In `onExport`, change `fieldKeys: [...selected]` to `fieldKeys: selectedKeys`.
- Replace the step-1 `<ExportFieldPicker … />` with:
  ```tsx
  <ExportFieldTransfer
    fields={active.exportFields}
    selectedKeys={selectedKeys}
    onChange={setSelectedKeys}
  />
  ```
- In the count line, replace both `selected.size` with `selectedKeys.length`.

- [ ] **Step 4: Delete the old picker + its test**

```bash
git -C .claude/worktrees/export-field-transfer rm web/src/features/import-export/components/ExportFieldPicker.tsx web/src/features/import-export/components/ExportFieldPicker.test.tsx
```
Then grep for any remaining `ExportFieldPicker` references (`grep -rn ExportFieldPicker web/src`) and remove them (e.g., a barrel export).

- [ ] **Step 5: Run wizard tests + type-check**

Run (from `web/`): `npx jest src/features/import-export/components/ExportWizard.test.tsx` — PASS.
Run (from `web/`): `npx tsc --noEmit` — no new errors, and no dangling `ExportFieldPicker` import errors.

- [ ] **Step 6: Commit**

```bash
git -C .claude/worktrees/export-field-transfer add web/src/features/import-export
git -C .claude/worktrees/export-field-transfer commit -m "feat(export): use the dual-list transfer in the export wizard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: E2E — pick, reorder, export

Add a Playwright flow covering the new interaction end to end.

**Files:**
- Modify or create: the export E2E spec under `e2e/` (find the existing import/export spec first: `ls e2e/ | grep -iE "export|import"`). Add a test; if none exists, create `e2e/export.spec.ts` following the conventions in existing specs (locators by role/label, `beforeEach` localStorage reset per `web-testing.md`).

**Interfaces:**
- Consumes: the running app (Task 2/3 UI + Task 1 API).

- [ ] **Step 1: Write the E2E test**

Navigate to Import & export → Export tab, choose an object, on the Fields step move two fields into Selected, reorder one (drag or the keyboard path), continue to Download, and trigger Export. Assert the Selected list order via `getByRole('option')` before export and that the download/flow completes. Use role/label locators; no `data-testid`. Match the auth/setup pattern the other e2e specs use.

- [ ] **Step 2: Run it**

Run (from `web/`): `npx playwright test export` (or the spec path). Expected: PASS in the configured browsers.

- [ ] **Step 3: Commit**

```bash
git -C .claude/worktrees/export-field-transfer add e2e
git -C .claude/worktrees/export-field-transfer commit -m "test(export): e2e pick, reorder, and export flow

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Slice-completion gate

- [ ] **Step 1:** From `web/`, `npx tsc --noEmit` (no new errors); from `api/`, `dotnet build` clean.
- [ ] **Step 2:** Invoke `/dev-review-and-remediate` (lint, `test:coverage` ≥80%, e2e, dotnet test, code + security review, design-conformance). Address findings.
- [ ] **Step 3:** On `CLEAN`, hand off to `/dev-ship`.

---

## Self-Review

- **Spec coverage:** dual-list component with move/filter/drag+keyboard-reorder/locked-identity (Task 2); ordered-array wizard state + ordered fieldKeys (Task 3); backend column ordering (Task 1); E2E (Task 4); tests across all (each task). All spec sections mapped.
- **Placeholder scan:** the wizard-test order case (Task 3 Step 1) and the E2E (Task 4) are skeletons because they must match each file's existing mock/auth setup — the transformation and assertions are concrete; the component and API code are complete. No "handle edge cases" left.
- **Type consistency:** `ExportFieldTransfer` prop names (`fields` / `selectedKeys` / `onChange`) are used identically in Tasks 2 and 3; `IoFieldSpec` shape matches `shared/types/imports.ts`; the API `fieldKeys` order contract lines up with the wizard sending `selectedKeys`.
- **Interaction reconciliation (note):** "both" move styles resolve to single-click = highlight, double-click = move, buttons move the highlighted set — a single click can't both select and move, so double-click is the immediate-move affordance. Recorded here so a reviewer doesn't read it as a spec gap.
