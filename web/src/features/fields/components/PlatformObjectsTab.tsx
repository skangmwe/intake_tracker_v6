// Platform Fields & objects — Objects tab (S34 / SP3b). Lists every Global object type: the built-ins
// (Request, Task — read-only) and Global custom objects a platform admin creates/edits/deletes. A
// Global custom object is firm-wide; each workspace keeps its own records. Renders explicit loading /
// error / empty states (web-component-architecture.md). Rendered only for a platform admin (the page
// gates access).

import { useMemo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';

import type { ObjectDefinitionDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { type TableColumn, TableShell } from '@/shared/components/Table';
import { problemMessage } from '@/shared/http/problemMessage';

import {
  useCreatePlatformObject,
  useDeletePlatformObject,
  usePlatformObjects,
  useUpdatePlatformObject,
} from '../usePlatformSchema';
import {
  PlatformObjectEditorSheet,
  type PlatformObjectFormValue,
} from './PlatformObjectEditorSheet';

const EM_DASH = '—';

// Name / plural / description + a trailing actions column. No Location column (every row is Global on
// this surface) and no counts (a Global object's records live per-workspace, not here).
const COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Object name', width: 200 },
  { key: 'plural', label: 'Plural label', width: 180 },
  { key: 'description', label: 'Description', flex: true },
  { key: 'actions', label: 'Actions', width: 120, align: 'right' },
];

/** Editor state: null = closed; { object: null } = create; { object: dto } = edit. */
type EditorState = { object: ObjectDefinitionDto | null } | null;

export function PlatformObjectsTab() {
  const objects = usePlatformObjects();
  const createObject = useCreatePlatformObject();
  const updateObject = useUpdatePlatformObject();
  const deleteObject = useDeletePlatformObject();

  const [editor, setEditor] = useState<EditorState>(null);

  const closeEditor = () => {
    createObject.reset();
    updateObject.reset();
    deleteObject.reset();
    setEditor(null);
  };

  const onSave = (value: PlatformObjectFormValue) => {
    const shared = {
      name: value.name,
      pluralLabel: value.pluralLabel.trim() || null,
      description: value.description.trim() || null,
      showInSidebar: value.showInSidebar,
      sidebarCategory: value.showInSidebar ? value.sidebarCategory.trim() || null : null,
    };
    if (editor?.object == null) {
      // Location is forced to Global server-side; sent here to satisfy the create contract.
      createObject.mutate({ ...shared, location: 'Global' }, { onSuccess: closeEditor });
    } else {
      updateObject.mutate({ objectId: editor.object.id, request: shared }, { onSuccess: closeEditor });
    }
  };

  const onDelete = (objectId: string) => {
    deleteObject.mutate(objectId, { onSuccess: closeEditor });
  };

  const saveError = createObject.isError
    ? problemMessage(createObject.error)
    : updateObject.isError
      ? problemMessage(updateObject.error)
      : deleteObject.isError
        ? problemMessage(deleteObject.error)
        : null;

  const rows = useMemo(
    () =>
      (objects.data ?? []).map((object: ObjectDefinitionDto) => ({
        id: object.id,
        cells: [
          <span key="name" className="objects-cell-name">
            {object.name}
          </span>,
          <span key="plural">{object.pluralLabel ?? EM_DASH}</span>,
          <span key="description" className="objects-cell-desc">
            {object.description ?? EM_DASH}
          </span>,
          // Built-ins are read-only; Global custom objects get an Edit action (Delete lives in the editor).
          object.isSystem ? (
            <span key="actions" className="caption">
              Built-in
            </span>
          ) : (
            <Button
              key="actions"
              variant="secondary"
              compact
              aria-label={`Edit ${object.name}`}
              onClick={() => setEditor({ object })}
            >
              Edit
            </Button>
          ),
        ],
      })),
    [objects.data],
  );

  return (
    <div className="objects-tab">
      <div className="objects-tab__toolbar">
        <span className="objects-tab__spacer" />
        <Button onClick={() => setEditor({ object: null })}>
          <Plus size={16} aria-hidden /> New object
        </Button>
      </div>

      {objects.isLoading && (
        <p className="caption" role="status">
          Loading objects…
        </p>
      )}

      {objects.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The object list could not be loaded. Try again in a moment.
        </p>
      )}

      {objects.data && rows.length === 0 && (
        <div className="objects-tab__no-matches">
          <p className="objects-tab__no-matches-title">No global objects are defined yet</p>
        </div>
      )}

      {objects.data && rows.length > 0 && (
        <TableShell caption="Global objects" columns={COLUMNS} rows={rows} />
      )}

      {editor && (
        <PlatformObjectEditorSheet
          object={editor.object}
          saveError={saveError}
          isSaving={createObject.isPending || updateObject.isPending}
          isDeleting={deleteObject.isPending}
          onSave={onSave}
          onDelete={onDelete}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}
