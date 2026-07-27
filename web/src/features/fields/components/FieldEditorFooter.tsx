// The footer action row for the field editor sheet (S30). Two branches: read-only shows a single
// Close button; editable shows optional Archive (workspace fields — fires immediately) or Delete
// (Global-object fields, SP3b Slice 2a — opens the inline confirm, FieldDeleteConfirm) plus
// Cancel / Save field. Extracted from FieldEditorSheet so the sheet stays under the component line
// budget (web-component-architecture.md) — the same pattern used for Type/Category, Extras, Rules.

import type { FieldDefinitionDto } from '@shared/types';

import { Button } from '@/shared/components/Button';

interface FieldEditorFooterProps {
  readOnly: boolean;
  field: FieldDefinitionDto | null;
  onArchive?: (() => void) | undefined;
  isArchiving: boolean;
  /** Opens the inline delete confirm (Global-object field flow) — never deletes directly. Hidden
   * while the confirm is open (the confirm block owns its own Cancel/Delete field buttons). */
  onRequestDelete?: (() => void) | undefined;
  confirmingDelete?: boolean | undefined;
  isSaving: boolean;
  onClose: () => void;
}

export function FieldEditorFooter({
  readOnly,
  field,
  onArchive,
  isArchiving,
  onRequestDelete,
  confirmingDelete = false,
  isSaving,
  onClose,
}: FieldEditorFooterProps) {
  if (readOnly) {
    return (
      <footer className="fields-sheet__footer">
        <span className="fields-sheet__footer-spacer" />
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </footer>
    );
  }

  return (
    <footer className="fields-sheet__footer">
      {field && !field.isRetired && onArchive && (
        <Button variant="secondary" onClick={onArchive} disabled={isArchiving}>
          {isArchiving ? 'Archiving…' : 'Archive'}
        </Button>
      )}
      {onRequestDelete && !confirmingDelete && (
        <Button variant="destructive" onClick={onRequestDelete}>
          Delete
        </Button>
      )}
      <span className="fields-sheet__footer-spacer" />
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" disabled={isSaving}>
        {isSaving ? 'Saving…' : 'Save field'}
      </Button>
    </footer>
  );
}
