// Inline destructive-delete confirmation for the field editor (SP3b Slice 2a — Global-object field
// flow). Mirrors PlatformObjectEditorSheet's inline confirm (role="alertdialog") — deleting a field
// on a Global custom object removes it from every workspace, so it confirms first, unlike the
// workspace field editor's immediate Archive (FieldEditorFooter). Extracted from FieldEditorSheet
// so the sheet stays under the component line budget (web-component-architecture.md).

import { Button } from '@/shared/components/Button';

interface FieldDeleteConfirmProps {
  fieldLabel: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function FieldDeleteConfirm({
  fieldLabel,
  isDeleting,
  onCancel,
  onConfirm,
}: FieldDeleteConfirmProps) {
  return (
    <div
      className="mws-alert mws-alert--error"
      role="alertdialog"
      aria-labelledby="field-delete-heading"
    >
      <p id="field-delete-heading">
        Delete “{fieldLabel}”? It will be removed from every workspace. This can’t be undone.
      </p>
      <span className="objects-sheet__footer-right">
        <Button variant="secondary" disabled={isDeleting} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" disabled={isDeleting} onClick={onConfirm}>
          {isDeleting ? 'Deleting…' : 'Delete field'}
        </Button>
      </span>
    </div>
  );
}
