// The footer action row for the field editor sheet (S30). Two branches: read-only shows a single
// Close button; editable shows optional Archive plus Cancel / Save field. Extracted from
// FieldEditorSheet so the sheet stays under the component line budget
// (web-component-architecture.md) — the same pattern used for Type/Category, Extras, and Rules.

import type { FieldDefinitionDto } from '@shared/types';

import { Button } from '@/shared/components/Button';

interface FieldEditorFooterProps {
  readOnly: boolean;
  field: FieldDefinitionDto | null;
  onArchive?: (() => void) | undefined;
  isArchiving: boolean;
  isSaving: boolean;
  onClose: () => void;
}

export function FieldEditorFooter({
  readOnly,
  field,
  onArchive,
  isArchiving,
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
