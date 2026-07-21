// Resolves an editable catalog row into its full field definition (options / rules / stages /
// derived config) before opening the editor. The flat catalog row is lightweight, so editing an
// existing field fetches that object's schema and finds the field by key. Renders explicit loading
// and error states inside the sheet chrome (web-component-architecture.md).

import { X } from '@phosphor-icons/react';

import type { FieldDefinitionUpsertRequest, FieldObjectType, WorkspaceId } from '@shared/types';

import { IconButton } from '@/shared/components/Button';

import { useWorkspaceFields } from '../useFields';
import { FieldEditorSheet } from './FieldEditorSheet';

interface FieldEditLoaderProps {
  workspaceId: WorkspaceId;
  objectType: FieldObjectType;
  fieldKey: string;
  availableKeysByObject: Partial<Record<FieldObjectType, string[]>>;
  saveError: string | null;
  isSaving: boolean;
  onSave: (fieldKey: string, request: FieldDefinitionUpsertRequest, isCreate: boolean) => void;
  onArchive: () => void;
  isArchiving: boolean;
  onClose: () => void;
}

function SheetMessage({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      className="fields-sheet"
      role="dialog"
      aria-modal="false"
      aria-label="Field editor"
      data-ds="sheet"
    >
      <header className="fields-sheet__header">
        <h2 className="h3">Edit field</h2>
        <IconButton icon={X} label="Close editor" onClick={onClose} />
      </header>
      <div className="fields-sheet__body">
        <p className="caption" role="status">
          {message}
        </p>
      </div>
    </div>
  );
}

export function FieldEditLoader({
  workspaceId,
  objectType,
  fieldKey,
  availableKeysByObject,
  saveError,
  isSaving,
  onSave,
  onArchive,
  isArchiving,
  onClose,
}: FieldEditLoaderProps) {
  const { data: schema, isLoading, isError } = useWorkspaceFields(workspaceId, objectType);

  if (isLoading && !schema) {
    return <SheetMessage message="Loading the field…" onClose={onClose} />;
  }

  const field = schema?.fields.find((candidate) => candidate.fieldKey === fieldKey) ?? null;

  if (isError || field === null) {
    return (
      <SheetMessage
        message="This field could not be loaded. Close and try again."
        onClose={onClose}
      />
    );
  }

  return (
    <FieldEditorSheet
      initialObjectType={objectType}
      field={field}
      availableKeysByObject={availableKeysByObject}
      saveError={saveError}
      isSaving={isSaving}
      onSave={onSave}
      onArchive={onArchive}
      isArchiving={isArchiving}
      onClose={onClose}
    />
  );
}
