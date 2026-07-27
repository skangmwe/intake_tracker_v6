// Editor state + mutations for authoring a field on a Global custom object from the platform Fields
// tab (SP3b Slice 2a, Task 6). Extracted from PlatformFieldsCatalogTab so the tab stays under the
// component line budget (web-component-architecture.md) — the same "extract a custom hook" escape
// hatch the rule calls out. `state.fieldKey === null` is create; otherwise it names the field being
// edited/deleted.

import { useState } from 'react';
import type { FieldDefinitionUpsertRequest } from '@shared/types';

import { problemMessage } from './errorMessage';
import {
  useCreatePlatformObjectField,
  useDeletePlatformObjectField,
  useUpdatePlatformObjectField,
} from './usePlatformSchema';

export interface GlobalFieldEditorState {
  objectKey: string;
  objectLabel: string;
  fieldKey: string | null;
}

export function useGlobalObjectFieldEditor() {
  const createField = useCreatePlatformObjectField();
  const updateField = useUpdatePlatformObjectField();
  const deleteField = useDeletePlatformObjectField();
  const [state, setState] = useState<GlobalFieldEditorState | null>(null);

  const open = (objectKey: string, objectLabel: string, fieldKey: string | null) =>
    setState({ objectKey, objectLabel, fieldKey });

  const close = () => {
    createField.reset();
    updateField.reset();
    deleteField.reset();
    setState(null);
  };

  const onSave = (fieldKey: string, request: FieldDefinitionUpsertRequest, isCreate: boolean) => {
    if (!state) return;
    const { objectKey } = state;
    if (isCreate) {
      createField.mutate({ objectKey, request }, { onSuccess: close });
    } else {
      updateField.mutate({ objectKey, fieldKey, request }, { onSuccess: close });
    }
  };

  const onDelete = () => {
    if (!state?.fieldKey) return;
    deleteField.mutate(
      { objectKey: state.objectKey, fieldKey: state.fieldKey },
      { onSuccess: close },
    );
  };

  const saveError = createField.isError
    ? problemMessage(createField.error)
    : updateField.isError
      ? problemMessage(updateField.error)
      : deleteField.isError
        ? problemMessage(deleteField.error)
        : null;

  return {
    state,
    open,
    close,
    onSave,
    onDelete,
    saveError,
    isSaving: createField.isPending || updateField.isPending,
    isDeleting: deleteField.isPending,
  };
}
