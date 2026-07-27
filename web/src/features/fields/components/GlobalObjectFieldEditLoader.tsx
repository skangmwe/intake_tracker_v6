// Resolves an editable Global-custom-object field row into its full field definition (options /
// rules / stages / derived config) before opening the editor (SP3b Slice 2a, Task 6). The flat
// platform catalog row is lightweight, so editing an existing field fetches that Global object's
// stored fields and finds the one being edited by key — mirrors FieldEditLoader (the workspace
// equivalent), swapping the workspace-scoped fetch for the platform Global-object one. Renders
// explicit loading and error states inside the sheet chrome (web-component-architecture.md).

import { X } from '@phosphor-icons/react';

import type { FieldDefinitionUpsertRequest } from '@shared/types';

import { IconButton } from '@/shared/components/Button';

import type { FieldKeyOption } from '../fieldForm';
import { usePlatformObjectFields } from '../usePlatformSchema';
import { FieldEditorSheet } from './FieldEditorSheet';

interface GlobalObjectFieldEditLoaderProps {
  objectKey: string;
  objectLabel: string;
  fieldKey: string;
  availableKeysByObject: Partial<Record<string, FieldKeyOption[]>>;
  saveError: string | null;
  isSaving: boolean;
  onSave: (fieldKey: string, request: FieldDefinitionUpsertRequest, isCreate: boolean) => void;
  onDelete: () => void;
  isDeleting: boolean;
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

export function GlobalObjectFieldEditLoader({
  objectKey,
  objectLabel,
  fieldKey,
  availableKeysByObject,
  saveError,
  isSaving,
  onSave,
  onDelete,
  isDeleting,
  onClose,
}: GlobalObjectFieldEditLoaderProps) {
  const { data: fields, isLoading, isError } = usePlatformObjectFields(objectKey);

  if (isLoading && !fields) {
    return <SheetMessage message="Loading the field…" onClose={onClose} />;
  }

  const field = fields?.find((candidate) => candidate.fieldKey === fieldKey) ?? null;

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
      initialObjectType={objectKey}
      field={field}
      fixedObject={{ objectType: objectKey, label: objectLabel }}
      availableKeysByObject={availableKeysByObject}
      saveError={saveError}
      isSaving={isSaving}
      onSave={onSave}
      onDelete={onDelete}
      isDeleting={isDeleting}
      onClose={onClose}
    />
  );
}
