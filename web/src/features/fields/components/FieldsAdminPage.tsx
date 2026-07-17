// Fields & objects admin surface (S30). A workspace admin defines and edits the field schema per
// object type — attributes, per-stage visibility, derived fields, and the task-field library. The
// platform-defined fields render in a read-only band. Renders explicit loading / error / empty
// states (web-component-architecture.md).

import { useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import type { FieldDefinitionDto, FieldObjectType, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { useMe } from '@/features/users/useMe';

import { RelationshipsAdminTab } from '@/features/relationships';

import { FIELD_TYPE_OPTIONS, TASK_FIELD_TYPE_OPTIONS } from '../constants';
import { problemMessage } from '../errorMessage';
import { useRetireField, useSaveField, useWorkspaceFields } from '../useFields';
import { FieldEditorSheet } from './FieldEditorSheet';
import { FieldList } from './FieldList';
import { ObjectTypeTabs } from './ObjectTypeTabs';
import { PlatformFieldBand } from './PlatformFieldBand';
import { SystemProvisionedFieldBand } from './SystemProvisionedFieldBand';

type S30Tab = 'fields' | 'relationships';

const S30_TABS: { value: S30Tab; label: string }[] = [
  { value: 'fields', label: 'Fields' },
  { value: 'relationships', label: 'Relationships' },
];

export function FieldsAdminPage() {
  const { data: me, isLoading: isMeLoading, isError: isMeError } = useMe();
  const adminMemberships = (me?.memberships ?? []).filter((membership) => membership.level === 'WorkspaceAdmin');

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<WorkspaceId | null>(null);
  const [objectType, setObjectType] = useState<FieldObjectType>('Request');
  const [editing, setEditing] = useState<{ field: FieldDefinitionDto | null } | null>(null);
  const [retireTarget, setRetireTarget] = useState<FieldDefinitionDto | null>(null);
  // v2 (slice 25). Outer S30 tab bar — Fields vs Relationships. Relationships is a sibling
  // admin surface on the same page per blueprint §Fields, objects & relationships schema.
  const [s30Tab, setS30Tab] = useState<S30Tab>('fields');

  const workspaceId = selectedWorkspaceId ?? adminMemberships[0]?.workspaceId ?? null;

  const { data: schema, isLoading, isError } = useWorkspaceFields(workspaceId ?? undefined, objectType);
  const saveField = useSaveField((workspaceId ?? '') as WorkspaceId, objectType);
  const retireField = useRetireField((workspaceId ?? '') as WorkspaceId, objectType);

  if (isMeLoading && !me) {
    return <p className="caption" role="status">Loading your workspaces…</p>;
  }

  if (isMeError && !me) {
    return <p className="mws-alert mws-alert--error" role="alert">We couldn’t load your access. Try again in a moment.</p>;
  }

  if (adminMemberships.length === 0 || workspaceId === null) {
    return (
      <section className="mws-empty mws-empty--zero" aria-labelledby="no-access-heading">
        <h1 id="no-access-heading" className="h2">Fields &amp; objects</h1>
        <p className="body">You need to be a workspace admin to manage the field schema. Ask an admin to grant access.</p>
      </section>
    );
  }

  const workspaceScopedFields = (schema?.fields ?? []).filter((field) => !field.isPlatformDefined);
  // System-provisioned rows render as a locked band above the editable list (Slice 25).
  const systemProvisionedFields = workspaceScopedFields.filter((field) => field.isSystemProvisioned === true);
  const fields = workspaceScopedFields.filter((field) => field.isSystemProvisioned !== true);
  const availableFieldKeys = workspaceScopedFields.map((field) => field.fieldKey);
  const typeOptions = objectType === 'Task' ? TASK_FIELD_TYPE_OPTIONS : FIELD_TYPE_OPTIONS;

  const closeEditor = () => {
    saveField.reset();
    setEditing(null);
  };

  const confirmRetire = () => {
    if (!retireTarget) return;
    retireField.mutate(retireTarget.fieldKey, { onSettled: () => setRetireTarget(null) });
  };

  return (
    <section aria-labelledby="fields-heading">
      <header className="fields-header">
        <div>
          <h1 id="fields-heading" className="h2">Fields &amp; objects</h1>
          <p className="body">Define the schema for each object type in this workspace.</p>
        </div>
        {s30Tab === 'fields' && (
          <Button onClick={() => setEditing({ field: null })}>
            <Plus size={16} aria-hidden /> Add field
          </Button>
        )}
      </header>

      {adminMemberships.length > 1 && (
        <label className="mws-field">
          <span className="caption">Workspace</span>
          <select
            className="mws-select"
            value={workspaceId}
            onChange={(event) => setSelectedWorkspaceId(event.target.value as WorkspaceId)}
          >
            {adminMemberships.map((membership) => (
              <option key={membership.workspaceId} value={membership.workspaceId}>
                {membership.workspaceName}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mws-tabs" role="tablist" aria-label="Fields & objects section" data-ds="tab">
        {S30_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={s30Tab === tab.value}
            tabIndex={s30Tab === tab.value ? 0 : -1}
            className={s30Tab === tab.value ? 'mws-tab mws-tab--active' : 'mws-tab'}
            onClick={() => setS30Tab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {s30Tab === 'relationships' ? (
        <RelationshipsAdminTab workspaceId={workspaceId as WorkspaceId} />
      ) : (
        <>
          <ObjectTypeTabs active={objectType} onChange={setObjectType} />

          {retireTarget && (
            <div className="mws-alert mws-alert--warning" role="alertdialog" aria-label="Confirm retire">
              <p>
                Retire <strong>{retireTarget.displayName}</strong>? It stays in the audit trail but is removed from the schema.
              </p>
              <div className="fields-confirm-actions">
                <Button variant="secondary" compact onClick={() => setRetireTarget(null)}>Cancel</Button>
                <Button variant="destructive" compact disabled={retireField.isPending} onClick={confirmRetire}>
                  Retire field
                </Button>
              </div>
            </div>
          )}

          {retireField.isError && (
            <p className="mws-alert mws-alert--error" role="alert">{problemMessage(retireField.error)}</p>
          )}

          {isLoading && <p className="caption" role="status">Loading the field schema…</p>}
          {isError && <p className="mws-alert mws-alert--error" role="alert">We couldn’t load the field schema. Try again in a moment.</p>}

          {schema && !isLoading && (
            <SystemProvisionedFieldBand fields={systemProvisionedFields} />
          )}

          {schema && !isLoading && (
            fields.length > 0 ? (
              <FieldList fields={fields} onEdit={(field) => setEditing({ field })} onRetire={setRetireTarget} />
            ) : (
              <div className="mws-empty mws-empty--filtered">
                <p className="body">No fields defined for {objectType} yet.</p>
                <Button variant="secondary" onClick={() => setEditing({ field: null })}>Add the first field</Button>
              </div>
            )
          )}

          {schema && <PlatformFieldBand platformFields={schema.platformFields} canManage={me?.isPlatformAdmin ?? false} />}
        </>
      )}

      {editing && (
        <FieldEditorSheet
          objectType={objectType}
          field={editing.field}
          fieldTypeOptions={typeOptions}
          availableFieldKeys={availableFieldKeys}
          saveError={saveField.isError ? problemMessage(saveField.error) : null}
          isSaving={saveField.isPending}
          onSave={(fieldKey, request, isCreate) =>
            saveField.mutate({ fieldKey, request, isCreate }, { onSuccess: closeEditor })
          }
          onClose={closeEditor}
        />
      )}
    </section>
  );
}
