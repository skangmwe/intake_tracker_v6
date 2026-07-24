// The trigger list + editor for one workspace (slice: triggers-request-authoring, Task 2.3). Renders
// the three non-data states explicitly (web-component-architecture.md); a row's Edit opens the side
// sheet, "New trigger" opens it empty. Condition field keys come from the Request field schema so the
// author picks real fields. Delete and save both round-trip through the workspace-admin API.

import { useMemo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import type { WorkspaceId } from '@shared/types';

import { useWorkspaceFields } from '@/features/fields';
import { Button } from '@/shared/components/Button';

import { cadenceLabel, categoryLabel } from '../constants';
import { triggerProblemMessage } from '../errorMessage';
import { useDeleteTrigger, useSaveTrigger, useTriggers } from '../triggersModel';
import type { TriggerDto, TriggerUpsertRequest } from '../types';
import { TriggerEditorSheet } from './TriggerEditorSheet';

type EditorState = { mode: 'create' } | { mode: 'edit'; trigger: TriggerDto } | null;

export function TriggersList({ workspaceId }: { workspaceId: WorkspaceId }) {
  const triggers = useTriggers(workspaceId);
  const requestFields = useWorkspaceFields(workspaceId, 'Request');
  const saveTrigger = useSaveTrigger(workspaceId);
  const deleteTrigger = useDeleteTrigger(workspaceId);

  const [editor, setEditor] = useState<EditorState>(null);

  const fieldKeys = useMemo(
    () => (requestFields.data?.fields ?? []).map((field) => field.fieldKey),
    [requestFields.data],
  );

  const closeEditor = () => {
    saveTrigger.reset();
    deleteTrigger.reset();
    setEditor(null);
  };

  const onSave = (request: TriggerUpsertRequest) =>
    saveTrigger.mutate(
      { triggerId: editor?.mode === 'edit' ? editor.trigger.triggerId : null, request },
      { onSuccess: closeEditor },
    );

  const onDelete = (triggerId: string) =>
    deleteTrigger.mutate(triggerId, { onSuccess: closeEditor });

  const saveError = saveTrigger.isError
    ? triggerProblemMessage(saveTrigger.error)
    : deleteTrigger.isError
      ? triggerProblemMessage(deleteTrigger.error)
      : null;

  const rows = triggers.data ?? [];

  return (
    <section aria-label="Time-based triggers">
      <div className="triggers-toolbar">
        <Button onClick={() => setEditor({ mode: 'create' })}>
          <Plus size={16} aria-hidden /> New trigger
        </Button>
      </div>

      {triggers.isLoading && (
        <p className="caption" role="status">
          Loading triggers…
        </p>
      )}

      {triggers.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The triggers could not be loaded. Try again in a moment.
        </p>
      )}

      {triggers.data && rows.length === 0 && (
        <div className="mws-empty mws-empty--zero">
          <p className="mws-empty__title">No triggers yet</p>
          <p className="mws-empty__body">
            Create a trigger to send a scheduled reminder when a request meets conditions you define.
          </p>
          <div className="mws-empty__actions">
            <Button onClick={() => setEditor({ mode: 'create' })}>
              <Plus size={16} aria-hidden /> New trigger
            </Button>
          </div>
        </div>
      )}

      {triggers.data && rows.length > 0 && (
        <div className="mws-table-shell">
          <table className="mws-table" data-ds="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Category</th>
                <th scope="col">Cadence</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((trigger) => (
                <tr key={trigger.triggerId}>
                  <td>{trigger.name}</td>
                  <td>{categoryLabel(trigger.notificationCategory)}</td>
                  <td>
                    {cadenceLabel(trigger.cadence)}
                    {trigger.cadence === 'RepeatEveryNDays' && trigger.repeatIntervalDays != null
                      ? ` · ${trigger.repeatIntervalDays}`
                      : ''}
                  </td>
                  <td>
                    {trigger.isEnabled ? (
                      <span className="mws-badge mws-badge--live" data-ds="badge">
                        <span className="mws-badge__dot" aria-hidden="true" /> Enabled
                      </span>
                    ) : (
                      <span className="mws-badge mws-badge--draft" data-ds="badge">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td>
                    <Button
                      variant="secondary"
                      compact
                      onClick={() => setEditor({ mode: 'edit', trigger })}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor?.mode === 'create' && (
        <TriggerEditorSheet
          trigger={null}
          fieldKeys={fieldKeys}
          saveError={saveError}
          isSaving={saveTrigger.isPending}
          onSave={onSave}
          onClose={closeEditor}
        />
      )}

      {editor?.mode === 'edit' && (
        <TriggerEditorSheet
          trigger={editor.trigger}
          fieldKeys={fieldKeys}
          saveError={saveError}
          isSaving={saveTrigger.isPending}
          onSave={onSave}
          onDelete={() => onDelete(editor.trigger.triggerId)}
          isDeleting={deleteTrigger.isPending}
          onClose={closeEditor}
        />
      )}
    </section>
  );
}
