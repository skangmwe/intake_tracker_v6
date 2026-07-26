// The object editor side sheet (S30 Objects tab) — create a custom object, edit one, or view a
// built-in / firm-wide object read-only. Non-blocking side sheet (disclosure-surfaces.md); Escape
// closes. Built-in objects AND Global (firm-wide, platform-owned) custom objects are locked (view
// only, no delete) — only a local custom object this workspace owns is editable. The Show-in-sidebar
// switch reveals the Sidebar category picker (with a "create new" option).

import { useEffect, useMemo, useRef, useState } from 'react';
import { LockSimple, Trash, X } from '@phosphor-icons/react';
import type { ObjectDefinitionDto, ObjectLocation } from '@shared/types';

import { Button, IconButton } from '@/shared/components/Button';

import {
  BASE_SIDEBAR_CATEGORIES,
  DEFAULT_SIDEBAR_CATEGORY,
  LOCATION_OPTIONS,
  NEW_CATEGORY_VALUE,
} from '../constants';

// A platform-owned Global custom object has no owning workspace, so it surfaces in every workspace
// with WorkspaceId = Guid.Empty (set by the API's MapCustom only for NULL-workspace rows). That empty
// owner is the signal this workspace can't edit it — NOT the Location label, since a workspace's own
// object stays editable even if its Location happens to be 'Global'.
const EMPTY_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

export interface ObjectFormValue {
  name: string;
  pluralLabel: string;
  location: ObjectLocation;
  description: string;
  showInSidebar: boolean;
  sidebarCategory: string;
}

interface ObjectEditorSheetProps {
  object: ObjectDefinitionDto | null; // null = create
  existingCategories: string[];
  saveError: string | null;
  isSaving: boolean;
  isDeleting: boolean;
  onSave: (value: ObjectFormValue) => void;
  onDelete: (objectId: string) => void;
  onClose: () => void;
}

function initialDraft(object: ObjectDefinitionDto | null): ObjectFormValue {
  if (object === null) {
    return {
      name: '',
      pluralLabel: '',
      location: 'LocalWorkspace',
      description: '',
      showInSidebar: true,
      sidebarCategory: DEFAULT_SIDEBAR_CATEGORY,
    };
  }
  return {
    name: object.name,
    pluralLabel: object.pluralLabel ?? '',
    location: object.location,
    description: object.description ?? '',
    showInSidebar: object.showInSidebar,
    sidebarCategory: object.sidebarCategory ?? DEFAULT_SIDEBAR_CATEGORY,
  };
}

export function ObjectEditorSheet({
  object,
  existingCategories,
  saveError,
  isSaving,
  isDeleting,
  onSave,
  onDelete,
  onClose,
}: ObjectEditorSheetProps) {
  const isCreate = object === null;
  // A platform-owned Global custom object (no owning workspace → WorkspaceId Guid.Empty) opens
  // read-only here, like a built-in. Only a custom object this workspace owns is editable.
  const isForeignGlobal = !(object?.isSystem ?? false) && object?.workspaceId === EMPTY_WORKSPACE_ID;
  const readOnly = (object?.isSystem ?? false) || isForeignGlobal;
  const [draft, setDraft] = useState<ObjectFormValue>(() => initialDraft(object));
  const [newCategory, setNewCategory] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const patch = (next: Partial<ObjectFormValue>) =>
    setDraft((current) => ({ ...current, ...next }));

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    for (const category of [
      ...BASE_SIDEBAR_CATEGORIES,
      ...existingCategories,
      draft.sidebarCategory,
    ]) {
      if (category && !seen.has(category)) {
        seen.add(category);
        options.push(category);
      }
    }
    return options;
  }, [existingCategories, draft.sidebarCategory]);

  const isNewCategory = draft.sidebarCategory === NEW_CATEGORY_VALUE;
  const canSave = draft.name.trim().length > 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    const resolvedCategory = isNewCategory
      ? newCategory.trim() || DEFAULT_SIDEBAR_CATEGORY
      : draft.sidebarCategory;
    onSave({ ...draft, name: draft.name.trim(), sidebarCategory: resolvedCategory });
  };

  const navHint = readOnly
    ? isForeignGlobal
      ? 'This firm-wide object’s navigation is managed by a platform admin.'
      : 'This built-in object always has a place in the navigation.'
    : 'Adds a navigation item for this object under a sidebar category.';

  return (
    <div
      className="fields-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="object-editor-heading"
      data-ds="sheet"
    >
      <header className="fields-sheet__header">
        <h2 id="object-editor-heading" tabIndex={-1} ref={headingRef} className="h3">
          {isCreate ? 'New object' : `Edit ${object.name}`}
        </h2>
        <IconButton icon={X} label="Close editor" onClick={onClose} />
      </header>

      <form className="fields-sheet__body" onSubmit={submit}>
        {saveError && (
          <p className="mws-alert mws-alert--error" role="alert">
            {saveError}
          </p>
        )}

        {readOnly && (
          <p className="mws-alert mws-alert--info fields-sheet__lock" role="note">
            <LockSimple size={16} aria-hidden />{' '}
            {isForeignGlobal
              ? 'This is a firm-wide object, managed by a platform admin. Its records are still available in this workspace.'
              : 'This is a built-in object. Its definition is managed by the platform and can’t be edited here.'}
          </p>
        )}

        <label className="mws-field">
          <span className="caption">Display name</span>
          <input
            className="mws-input"
            value={draft.name}
            required
            disabled={readOnly}
            placeholder="Singular record name, e.g. Vendor"
            onChange={(event) => patch({ name: event.target.value })}
          />
        </label>

        <div className="fields-inline-pair">
          <label className="mws-field">
            <span className="caption">Plural label</span>
            <input
              className="mws-input"
              value={draft.pluralLabel}
              disabled={readOnly}
              placeholder="e.g. Vendors"
              onChange={(event) => patch({ pluralLabel: event.target.value })}
            />
          </label>
          <label className="mws-field">
            <span className="caption">Location</span>
            <select
              className="mws-select"
              value={draft.location}
              disabled={readOnly}
              onChange={(event) => patch({ location: event.target.value as ObjectLocation })}
            >
              {LOCATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mws-field">
          <span className="caption">Description</span>
          <textarea
            className="mws-textarea"
            rows={3}
            value={draft.description}
            disabled={readOnly}
            placeholder="What this record type represents"
            onChange={(event) => patch({ description: event.target.value })}
          />
        </label>

        <div className="objects-switch-box">
          <span className="objects-switch-box__text">
            <span className="objects-switch-box__title">Show in left sidebar</span>
            <span className="caption">{navHint}</span>
          </span>
          <label className="mws-switch">
            <input
              type="checkbox"
              aria-label="Show in left sidebar"
              checked={draft.showInSidebar}
              disabled={readOnly}
              onChange={(event) => patch({ showInSidebar: event.target.checked })}
            />
            <span className="mws-switch__track">
              <span className="mws-switch__thumb" />
            </span>
          </label>
        </div>

        {!readOnly && draft.showInSidebar && (
          <label className="mws-field">
            <span className="caption">Sidebar category</span>
            <select
              className="mws-select"
              value={draft.sidebarCategory}
              onChange={(event) => patch({ sidebarCategory: event.target.value })}
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
              <option value={NEW_CATEGORY_VALUE}>+ Create new category…</option>
            </select>
          </label>
        )}

        {!readOnly && draft.showInSidebar && isNewCategory && (
          <label className="mws-field">
            <span className="caption">New category name</span>
            <input
              className="mws-input"
              value={newCategory}
              placeholder="e.g. Vendors"
              onChange={(event) => setNewCategory(event.target.value)}
            />
          </label>
        )}

        {object !== null && (
          <dl className="objects-meta">
            <div className="objects-meta__item">
              <dt className="caption">Records</dt>
              <dd className="objects-meta__value">{object.recordsCount}</dd>
            </div>
            <div className="objects-meta__item">
              <dt className="caption">Fields</dt>
              <dd className="objects-meta__value">{object.fieldsCount}</dd>
            </div>
          </dl>
        )}

        <footer className="fields-sheet__footer objects-sheet__footer">
          <span className="objects-sheet__footer-left">
            {!isCreate && !readOnly && (
              <Button
                variant="destructive"
                disabled={isDeleting}
                onClick={() => onDelete(object.id)}
              >
                <Trash size={16} aria-hidden /> {isDeleting ? 'Deleting…' : 'Delete'}
              </Button>
            )}
          </span>
          <span className="objects-sheet__footer-right">
            <Button variant="secondary" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {!readOnly && (
              <Button type="submit" disabled={isSaving || !canSave}>
                {isSaving ? 'Saving…' : 'Save object'}
              </Button>
            )}
          </span>
        </footer>
      </form>
    </div>
  );
}
