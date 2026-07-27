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
import { IconButton } from '@/shared/components/Button';

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
    const fromValue = next[from];
    const toValue = next[to];
    if (fromValue === undefined || toValue === undefined) return;
    next[from] = toValue;
    next[to] = fromValue;
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
          <MagnifyingGlass size={16} weight="regular" aria-hidden />
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
        <IconButton icon={CaretRight} label="Move selected right" bordered onClick={moveRight} />
        <IconButton icon={CaretDoubleRight} label="Move all right" bordered onClick={moveAllRight} />
        <IconButton icon={CaretLeft} label="Remove selected" bordered onClick={moveLeft} />
        <IconButton icon={CaretDoubleLeft} label="Clear all" bordered onClick={clearAll} />
      </div>

      {/* Selected */}
      <div className="ie-transfer__col">
        <div className="ie-transfer__col-head" id="ie-transfer-sel-label">
          Selected
        </div>
        <label className="ie-transfer__search">
          <MagnifyingGlass size={16} weight="regular" aria-hidden />
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
                <Lock size={16} weight="regular" aria-hidden /> {field.label}
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
