// The platform object editor side sheet (S34 / SP3b) — create or edit a Global (firm-wide) custom
// object. Global objects have no owning workspace, so there is no Location control (always Global) and
// no per-workspace record/field counts. Non-blocking side sheet (disclosure-surfaces.md); Escape
// closes. Editing exposes a soft Delete. Fields: name, plural label, description, show-in-sidebar
// (+ category). Mirrors the workspace object editor so both surfaces read as one product.

import { useEffect, useRef, useState } from 'react';
import { Trash, X } from '@phosphor-icons/react';
import type { ObjectDefinitionDto } from '@shared/types';

import { Button, IconButton } from '@/shared/components/Button';

export interface PlatformObjectFormValue {
  name: string;
  pluralLabel: string;
  description: string;
  showInSidebar: boolean;
  sidebarCategory: string;
}

interface PlatformObjectEditorSheetProps {
  object: ObjectDefinitionDto | null; // null = create
  saveError: string | null;
  isSaving: boolean;
  isDeleting: boolean;
  onSave: (value: PlatformObjectFormValue) => void;
  onDelete: (objectId: string) => void;
  onClose: () => void;
}

function initialDraft(object: ObjectDefinitionDto | null): PlatformObjectFormValue {
  if (object === null) {
    return { name: '', pluralLabel: '', description: '', showInSidebar: true, sidebarCategory: '' };
  }
  return {
    name: object.name,
    pluralLabel: object.pluralLabel ?? '',
    description: object.description ?? '',
    showInSidebar: object.showInSidebar,
    sidebarCategory: object.sidebarCategory ?? '',
  };
}

export function PlatformObjectEditorSheet({
  object,
  saveError,
  isSaving,
  isDeleting,
  onSave,
  onDelete,
  onClose,
}: PlatformObjectEditorSheetProps) {
  const isCreate = object === null;
  const [draft, setDraft] = useState<PlatformObjectFormValue>(() => initialDraft(object));
  // Deleting a Global object removes a record type from every workspace, so it confirms inline first
  // (destructive actions confirm — disclosure-surfaces.md).
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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

  const patch = (next: Partial<PlatformObjectFormValue>) =>
    setDraft((current) => ({ ...current, ...next }));

  const canSave = draft.name.trim().length > 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    onSave({ ...draft, name: draft.name.trim() });
  };

  return (
    <div
      className="fields-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="platform-object-editor-heading"
      data-ds="sheet"
    >
      <header className="fields-sheet__header">
        <h2 id="platform-object-editor-heading" tabIndex={-1} ref={headingRef} className="h3">
          {isCreate ? 'New global object' : `Edit ${object.name}`}
        </h2>
        <IconButton icon={X} label="Close editor" onClick={onClose} />
      </header>

      <form className="fields-sheet__body" onSubmit={submit}>
        {saveError && (
          <p className="mws-alert mws-alert--error" role="alert">
            {saveError}
          </p>
        )}

        <p className="body">This is a firm-wide object. It is available in every workspace.</p>

        <label className="mws-field">
          <span className="caption">Display name</span>
          <input
            className="mws-input"
            value={draft.name}
            required
            placeholder="Singular record name, e.g. Vendor"
            onChange={(event) => patch({ name: event.target.value })}
          />
        </label>

        <label className="mws-field">
          <span className="caption">Plural label</span>
          <input
            className="mws-input"
            value={draft.pluralLabel}
            placeholder="e.g. Vendors"
            onChange={(event) => patch({ pluralLabel: event.target.value })}
          />
        </label>

        <label className="mws-field">
          <span className="caption">Description</span>
          <textarea
            className="mws-textarea"
            rows={3}
            value={draft.description}
            placeholder="What this record type represents"
            onChange={(event) => patch({ description: event.target.value })}
          />
        </label>

        <div className="objects-switch-box">
          <span className="objects-switch-box__text">
            <span className="objects-switch-box__title">Show in left sidebar</span>
            <span className="caption">
              Adds a navigation item for this object in every workspace, under a sidebar category.
            </span>
          </span>
          <label className="mws-switch">
            <input
              type="checkbox"
              aria-label="Show in left sidebar"
              checked={draft.showInSidebar}
              onChange={(event) => patch({ showInSidebar: event.target.checked })}
            />
            <span className="mws-switch__track">
              <span className="mws-switch__thumb" />
            </span>
          </label>
        </div>

        {draft.showInSidebar && (
          <label className="mws-field">
            <span className="caption">Sidebar category</span>
            <input
              className="mws-input"
              value={draft.sidebarCategory}
              placeholder="e.g. Reference"
              onChange={(event) => patch({ sidebarCategory: event.target.value })}
            />
          </label>
        )}

        {!isCreate && confirmingDelete && (
          <div
            className="mws-alert mws-alert--error"
            role="alertdialog"
            aria-labelledby="platform-object-delete-heading"
          >
            <p id="platform-object-delete-heading">
              Delete “{object.name}”? It will be removed from every workspace. This can’t be undone.
            </p>
            <span className="objects-sheet__footer-right">
              <Button
                variant="secondary"
                disabled={isDeleting}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" disabled={isDeleting} onClick={() => onDelete(object.id)}>
                {isDeleting ? 'Deleting…' : 'Delete object'}
              </Button>
            </span>
          </div>
        )}

        <footer className="fields-sheet__footer objects-sheet__footer">
          <span className="objects-sheet__footer-left">
            {!isCreate && !confirmingDelete && (
              <Button
                variant="destructive"
                disabled={isDeleting}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash size={16} aria-hidden /> Delete
              </Button>
            )}
          </span>
          <span className="objects-sheet__footer-right">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !canSave}>
              {isSaving ? 'Saving…' : 'Save object'}
            </Button>
          </span>
        </footer>
      </form>
    </div>
  );
}
