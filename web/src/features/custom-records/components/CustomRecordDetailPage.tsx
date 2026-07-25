// SP2 custom-object record detail (route /objects/:objectKey/:recordId). A single column: breadcrumb,
// header (name + id + Delete), a meta strip (Created / Last updated / Created by), and a data-driven
// fields panel of inline controls with debounced autosave. Editing any field schedules one patch that
// sends the record's full field map (last-write-wins — SP1 carries no If-Match). Delete confirms inline
// (destructive actions confirm — disclosure-surfaces.md) then returns to the list. A load error renders
// NoAccessPage so the surface never discloses a record the caller can't see.
// Length: a route component composing breadcrumb + header + delete-confirm + meta strip + the
// autosave fields panel (web-component-architecture.md allows page components up to 250 lines).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CaretRight, CloudCheck } from '@phosphor-icons/react';

import type { FieldObjectType, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { FieldControl } from '@/shared/components/Form/FieldControl';
import { NoAccessPage } from '@/shared/components/EdgeStates';
import {
  evaluateFieldConditions,
  groupFieldsBySection,
  type FieldValueMap,
} from '@/shared/fields/fieldForm';
import { SAVE_DEBOUNCE_MS } from '@/shared/constants';
import { formatDateTime } from '@/shared/utils/dateFormat';
import { useMe } from '@/features/users/useMe';
import { resolveActiveWorkspaceId } from '@/shared/workspace/activeWorkspace';
import { useWorkspaceObjects } from '@/features/objects';
import { useWorkspaceFields } from '@/features/fields';

import { useCustomRecord, useDeleteCustomRecord, usePatchCustomRecord } from '../useCustomRecords';
import '../customRecords.css';

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="cr-meta-item">
      <span className="cr-meta-item__label">{label}</span>
      <span className="cr-meta-item__value">{value}</span>
    </div>
  );
}

export function CustomRecordDetailPage() {
  const navigate = useNavigate();
  const { objectKey = '', recordId = '' } = useParams<{ objectKey: string; recordId: string }>();
  const { data: me, isLoading: isMeLoading } = useMe();
  const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);

  const objects = useWorkspaceObjects(workspaceId ?? undefined);
  const object = objects.data?.find((candidate) => candidate.objectKey === objectKey);

  const schema = useWorkspaceFields(
    object ? (workspaceId ?? undefined) : undefined,
    (object?.objectKey ?? 'Request') as FieldObjectType,
  );
  const record = useCustomRecord(workspaceId ?? undefined, object?.id, recordId);

  const patch = usePatchCustomRecord((workspaceId ?? '') as WorkspaceId, object?.id ?? '', recordId);
  const remove = useDeleteCustomRecord((workspaceId ?? '') as WorkspaceId, object?.id ?? '');

  const [values, setValues] = useState<FieldValueMap>({});
  const [editedOnce, setEditedOnce] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed the editable values only when the record identity changes — NOT on every reference change. A
  // successful patch re-writes the cached record (same id); re-seeding on that would clobber in-flight
  // edits. Documented deviation from exhaustive-deps per web-component-architecture.md.
  const loadedRecord = record.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setValues({ ...(loadedRecord?.fields ?? {}) }), [loadedRecord?.id]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const userFields = useMemo(
    () => (schema.data?.fields ?? []).filter((field) => field.fieldKey !== 'name'),
    [schema.data],
  );
  const sections = useMemo(() => groupFieldsBySection(userFields), [userFields]);
  const conditions = useMemo(() => evaluateFieldConditions(userFields, values), [userFields, values]);

  if (isMeLoading || objects.isLoading) {
    return (
      <main className="cr-page" data-ds="page">
        <p className="caption" role="status">
          Loading the record…
        </p>
      </main>
    );
  }

  if (!workspaceId || !object) {
    return <NoAccessPage resourceNoun="record" onGoHome={() => navigate('/')} />;
  }

  if (record.isLoading) {
    return (
      <main className="cr-page" data-ds="page">
        <p className="caption" role="status">
          Loading the record…
        </p>
      </main>
    );
  }

  // A missing / forbidden record is non-disclosing — NoAccessPage, never a 404 that confirms existence.
  if (record.isError || !record.data) {
    return <NoAccessPage resourceNoun="record" onGoHome={() => navigate(`/objects/${objectKey}`)} />;
  }

  const current = record.data;
  const listTitle = object.pluralLabel ?? object.name;

  const handleChange = (fieldKey: string, value: unknown) => {
    setEditedOnce(true);
    const next: FieldValueMap = { ...values, [fieldKey]: value };
    setValues(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      patch.mutate({ name: current.name, fields: next });
    }, SAVE_DEBOUNCE_MS);
  };

  const handleDelete = async () => {
    try {
      await remove.mutateAsync(current.id);
      navigate(`/objects/${objectKey}`);
    } catch {
      // Surfaced via the inline alert (remove.isError). No rethrow.
    }
  };

  return (
    <main className="cr-page" data-ds="page">
      <nav aria-label="Breadcrumb" className="cr-breadcrumb">
        <button type="button" className="cr-breadcrumb__link" onClick={() => navigate(`/objects/${objectKey}`)}>
          {listTitle}
        </button>
        <CaretRight size={14} aria-hidden />
        <span className="cr-breadcrumb__current" aria-current="page">
          {current.name}
        </span>
      </nav>

      <div className="cr-detail">
        <header className="cr-detail__header">
          <div className="cr-detail__heading">
            <span className="cr-detail__id">{current.id}</span>
            <h1 className="h2">{current.name}</h1>
          </div>
          {!confirming && (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          )}
        </header>

        {confirming && (
          <div className="mws-card cr-confirm" role="alertdialog" aria-label="Delete record">
            <p className="cr-confirm__text">
              Delete “{current.name}”? This can’t be undone.
            </p>
            {remove.isError && (
              <p className="mws-alert mws-alert--error" role="alert">
                This record could not be deleted. Try again in a moment.
              </p>
            )}
            <div className="cr-actions">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={remove.isPending}>
                Delete record
              </Button>
            </div>
          </div>
        )}

        <div className="cr-detail__meta">
          <MetaItem label="Created" value={formatDateTime(current.createdAt)} />
          <MetaItem label="Last updated" value={formatDateTime(current.updatedAt)} />
          <MetaItem label="Created by" value={current.createdBy} />
        </div>

        <span className="cr-saved" aria-live="polite">
          {patch.isPending ? (
            'Saving…'
          ) : editedOnce && patch.isSuccess ? (
            <>
              <CloudCheck size={16} aria-hidden />
              All changes saved
            </>
          ) : null}
        </span>

        {schema.isLoading ? (
          <p className="caption" role="status">
            Loading fields…
          </p>
        ) : schema.isError || !schema.data ? (
          <p className="mws-alert mws-alert--error" role="alert">
            The field schema could not be loaded. Try again in a moment.
          </p>
        ) : (
          sections.map((group) => {
            const visible = group.fields.filter((field) => !conditions.hidden.has(field.fieldKey));
            if (visible.length === 0) return null;
            return (
              <section key={group.section} className="mws-card cr-section" aria-label={group.section}>
                <h2 className="cr-section__title">{group.section}</h2>
                <div className="cr-section__fields">
                  {visible.map((field) => (
                    <FieldControl
                      key={field.fieldKey}
                      field={field}
                      value={values[field.fieldKey]}
                      onChange={(value) => handleChange(field.fieldKey, value)}
                      required={conditions.required.has(field.fieldKey)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
