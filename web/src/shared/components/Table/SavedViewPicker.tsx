// Saved-view picker (S2). A bordered trigger shows the active view name + an uppercase meta line
// and a caret; the menu groups views into Shared / Personal, each row carrying an active check, a
// label, an optional tag, and a monospace record count. The footer exposes three actions (the last
// accent-coloured). Switching and the footer actions fire callbacks — the real editor is slice 14.
// Closes on Escape and outside click.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CaretDown, Check } from '@phosphor-icons/react';

import './SavedViewPicker.css';

export interface SavedView {
  id: string;
  name: string;
  scope: 'shared' | 'personal';
  isDefault?: boolean;
  tag?: string;
}

interface SavedViewPickerProps {
  views: SavedView[];
  activeViewId: string;
  onSelect: (id: string) => void;
  countFor: (viewId: string) => ReactNode;
  onModifyColumns: () => void;
  onEditView: () => void;
  onSaveAsNew: () => void;
}

function metaLine(view: SavedView | undefined): string {
  if (!view) return '';
  const scope = view.scope === 'shared' ? 'Shared' : 'Personal';
  return view.isDefault ? `Default · ${scope}` : scope;
}

interface ViewGroupProps {
  heading: string;
  views: SavedView[];
  activeViewId: string;
  onSelect: (id: string) => void;
  countFor: (viewId: string) => ReactNode;
}

function ViewGroup({ heading, views, activeViewId, onSelect, countFor }: ViewGroupProps) {
  if (views.length === 0) return null;
  return (
    <div className="ast-view-menu__group" role="group" aria-label={heading}>
      <p className="ast-view-menu__heading">{heading}</p>
      {views.map((view) => {
        const isActive = view.id === activeViewId;
        return (
          <button
            key={view.id}
            type="button"
            className="ast-view-menu__row"
            aria-pressed={isActive}
            onClick={() => onSelect(view.id)}
          >
            <span className="ast-view-menu__check" aria-hidden>
              {isActive && <Check size={16} weight="regular" />}
            </span>
            <span className="ast-view-menu__label">{view.name}</span>
            {view.tag && <span className="ast-view-menu__tag">{view.tag}</span>}
            <span className="ast-view-menu__count">{countFor(view.id)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SavedViewPicker({
  views,
  activeViewId,
  onSelect,
  countFor,
  onModifyColumns,
  onEditView,
  onSaveAsNew,
}: SavedViewPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = views.find((view) => view.id === activeViewId);

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const select = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div className="ast-view-picker" ref={containerRef} data-ds="saved-view-picker">
      <button
        ref={triggerRef}
        type="button"
        className="ast-view-picker__trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="ast-view-picker__names">
          <span className="ast-view-picker__name">{active?.name ?? 'Select a view'}</span>
          <span className="ast-view-picker__meta">{metaLine(active)}</span>
        </span>
        <CaretDown size={16} weight="regular" aria-hidden />
      </button>

      {open && (
        <div className="mws-popover ast-view-menu" aria-label="Saved views">
          <ViewGroup
            heading="Shared"
            views={views.filter((view) => view.scope === 'shared')}
            activeViewId={activeViewId}
            onSelect={select}
            countFor={countFor}
          />
          <ViewGroup
            heading="Personal"
            views={views.filter((view) => view.scope === 'personal')}
            activeViewId={activeViewId}
            onSelect={select}
            countFor={countFor}
          />
          <div className="ast-view-menu__divider" role="separator" />
          <div className="ast-view-menu__footer">
            <button type="button" className="ast-view-menu__action" onClick={onModifyColumns}>
              Modify columns
            </button>
            <button type="button" className="ast-view-menu__action" onClick={onEditView}>
              Edit this view
            </button>
            <button
              type="button"
              className="ast-view-menu__action ast-view-menu__action--accent"
              onClick={onSaveAsNew}
            >
              Save as new view
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
