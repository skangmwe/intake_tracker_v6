// S24 Saved-view editor — a tabbed side sheet (Filters / Fields / Sort) opened from a list's
// saved-view picker. Self-contained: given a workspace + object type + the surface's columns, it
// creates or edits a real SavedView and closes on success. A side sheet per disclosure-surfaces.md
// (slides from the right over content); Escape / scrim / close dismiss and focus returns to the
// trigger. Presentation-only metadata — a view never widens access (BS §22.4).

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';

import type { SavedViewDto, SavedViewObjectType, WorkspaceId } from '@shared/types';

import { Button, IconButton } from '@/shared/components/Button';
import { TextField } from '@/shared/components/Form';

import { useCreateSavedView, useUpdateSavedView } from '../useSavedViews';
import {
  draftFromView,
  draftToUpsertRequest,
  emptyDraft,
  isDraftValid,
  type EditorDraft,
} from '../savedViewEditorModel';
import { FieldsTab, FiltersTab, SortTab, type ColumnOption } from './SavedViewEditorTabs';
import '../savedViews.css';

type EditorTab = 'filters' | 'fields' | 'sort';

const TABS: Array<{ id: EditorTab; label: string }> = [
  { id: 'filters', label: 'Filters' },
  { id: 'fields', label: 'Fields' },
  { id: 'sort', label: 'Sort' },
];

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface SavedViewEditorProps {
  workspaceId: WorkspaceId;
  objectType: SavedViewObjectType;
  availableColumns: ColumnOption[];
  defaultColumns: string[];
  editingView: SavedViewDto | null;
  initialTab?: EditorTab;
  /** Whether the caller may create/save a shared view (WorkspaceAdmin). Gates the shared toggle. */
  canShare: boolean;
  onClose: () => void;
  onSaved?: (view: SavedViewDto) => void;
}

export function SavedViewEditor({
  workspaceId,
  objectType,
  availableColumns,
  defaultColumns,
  editingView,
  initialTab = 'filters',
  canShare,
  onClose,
  onSaved,
}: SavedViewEditorProps) {
  const [tab, setTab] = useState<EditorTab>(initialTab);
  const [draft, setDraft] = useState<EditorDraft>(() =>
    editingView ? draftFromView(editingView) : emptyDraft(defaultColumns),
  );
  const sheetRef = useRef<HTMLDivElement>(null);

  const create = useCreateSavedView(workspaceId, objectType);
  const update = useUpdateSavedView(workspaceId, objectType);
  const isSaving = create.isPending || update.isPending;
  const failed = create.isError || update.isError;

  useEffect(() => {
    // Focus the name field on open; trap Tab within the sheet; Escape closes; focus returns to the
    // opener on unmount (accessibility.md — focus-trapped modal surface, matching the Modal primitive).
    const opener = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    sheet?.querySelector<HTMLInputElement>('input.mws-input')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !sheet) return;
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => !element.hasAttribute('disabled'),
      );
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (!firstEl || !lastEl) return;
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      opener?.focus?.();
    };
  }, [onClose]);

  const patch = (change: Partial<EditorDraft>) => setDraft((prev) => ({ ...prev, ...change }));

  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    if (event.key in keys) {
      event.preventDefault();
      setTab(TABS[keys[event.key]!]!.id);
    }
  };

  const save = () => {
    if (!isDraftValid(draft) || isSaving) return;
    const request = draftToUpsertRequest(draft, objectType);
    const onSuccess = (view: SavedViewDto) => {
      onSaved?.(view);
      onClose();
    };
    if (editingView) {
      update.mutate({ savedViewId: editingView.id, request }, { onSuccess });
    } else {
      create.mutate(request, { onSuccess });
    }
  };

  const titleId = 'sv-editor-title';
  const heading = useMemo(() => (editingView ? 'Edit view' : 'New saved view'), [editingView]);

  return (
    <div className="sv-overlay" onMouseDown={onClose}>
      <div
        ref={sheetRef}
        className="sv-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-ds="side-sheet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sv-sheet__header">
          <h2 id={titleId} className="sv-sheet__title">
            {heading}
          </h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>

        <div className="sv-sheet__body">
          <TextField
            label="View name"
            value={draft.name}
            onChange={(name) => patch({ name })}
            placeholder="e.g. My open work"
          />

          <div className="sv-tabs" role="tablist" aria-label="View settings" data-ds="tabs">
            {TABS.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                id={`sv-tab-${entry.id}`}
                aria-selected={tab === entry.id}
                tabIndex={tab === entry.id ? 0 : -1}
                className={`sv-tabs__tab${tab === entry.id ? ' sv-tabs__tab--active' : ''}`}
                onClick={() => setTab(entry.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {tab === 'filters' && (
            <FiltersTab
              rows={draft.filters}
              columns={availableColumns}
              onChange={(filters) => patch({ filters })}
            />
          )}
          {tab === 'fields' && (
            <FieldsTab
              selected={draft.columns}
              columns={availableColumns}
              onChange={(columns) => patch({ columns })}
            />
          )}
          {tab === 'sort' && (
            <SortTab
              rows={draft.sort}
              columns={availableColumns}
              onChange={(sort) => patch({ sort })}
            />
          )}

          {failed && (
            <p className="mws-alert mws-alert--error" role="alert">
              The view couldn&apos;t be saved. Check your access and try again.
            </p>
          )}
        </div>

        <footer className="sv-sheet__footer">
          <div className="sv-sheet__scope">
            <span className="sv-scope__label" id="sv-scope-label">
              Visibility
            </span>
            <div className="sv-scope__group" role="radiogroup" aria-labelledby="sv-scope-label">
              <button
                type="button"
                role="radio"
                aria-checked={draft.scope === 'personal'}
                className={`sv-scope__seg${draft.scope === 'personal' ? ' sv-scope__seg--active' : ''}`}
                onClick={() => patch({ scope: 'personal' })}
              >
                Personal
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={draft.scope === 'shared'}
                className={`sv-scope__seg${draft.scope === 'shared' ? ' sv-scope__seg--active' : ''}`}
                disabled={!canShare}
                title={canShare ? undefined : 'Only a workspace admin can create shared views'}
                onClick={() => patch({ scope: 'shared' })}
              >
                Shared
              </button>
            </div>
            <label className="sv-default">
              <input
                type="checkbox"
                checked={draft.isDefault}
                onChange={(event) => patch({ isDefault: event.target.checked })}
              />
              Default view
            </label>
          </div>
          <div className="sv-sheet__actions">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={!isDraftValid(draft) || isSaving}>
              {isSaving ? 'Saving…' : 'Save view'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
