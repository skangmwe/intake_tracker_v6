// SP2 custom-object record create form (route /objects/:objectKey/new). Data-driven from the
// object's field schema, grouped by section, with the condition engine evaluated client-side so
// Show/Hide/Require reveals happen live. A first-class Name field maps to the record's Name column;
// the remaining user fields map into the FieldValues bag. Validated on submit via the shared
// validateFieldForm; an unknown slug renders NoAccessPage so the surface never discloses existence.
// (web-component-architecture.md — a route component composing schema resolution + form wiring.)

import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { FieldObjectType, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { TextField } from '@/shared/components/Form';
import { FieldControl } from '@/shared/components/Form/FieldControl';
import { NoAccessPage } from '@/shared/components/EdgeStates';
import {
  evaluateFieldConditions,
  groupFieldsBySection,
  validateFieldForm,
  type FieldValueMap,
} from '@/shared/fields/fieldForm';
import { useMe } from '@/features/users/useMe';
import { resolveActiveWorkspaceId } from '@/shared/workspace/activeWorkspace';
import { useWorkspaceObjects } from '@/features/objects';
import { useWorkspaceFields } from '@/features/fields';

import { useCreateCustomRecord } from '../useCustomRecords';
import '../customRecords.css';

export function CustomRecordCreatePage() {
  const navigate = useNavigate();
  const { objectKey = '' } = useParams<{ objectKey: string }>();
  const { data: me, isLoading: isMeLoading } = useMe();
  const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);

  const objects = useWorkspaceObjects(workspaceId ?? undefined);
  const object = objects.data?.find((candidate) => candidate.objectKey === objectKey);

  // Slice A widened GET /fields to resolve custom-object slugs; the TS FieldObjectType union stays
  // closed to preserve built-in autocomplete, so the slug is cast at this single call site.
  const schema = useWorkspaceFields(
    object ? (workspaceId ?? undefined) : undefined,
    (object?.objectKey ?? 'Request') as FieldObjectType,
  );

  const create = useCreateCustomRecord((workspaceId ?? '') as WorkspaceId, object?.id ?? '');

  const [name, setName] = useState('');
  const [values, setValues] = useState<FieldValueMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [triedSubmit, setTriedSubmit] = useState(false);

  // Name is a first-class record column, rendered separately — never as a schema field control.
  const userFields = useMemo(
    () => (schema.data?.fields ?? []).filter((field) => field.fieldKey !== 'name'),
    [schema.data],
  );
  const sections = useMemo(() => groupFieldsBySection(userFields), [userFields]);
  const conditions = useMemo(
    () => evaluateFieldConditions(userFields, values),
    [userFields, values],
  );

  const setField = (fieldKey: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [fieldKey]: value }));

  if (isMeLoading || objects.isLoading) {
    return (
      <main className="cr-page" data-ds="page">
        <p className="caption" role="status">
          Loading the form…
        </p>
      </main>
    );
  }

  if (!workspaceId || !object) {
    return <NoAccessPage resourceNoun="record" onGoHome={() => navigate('/')} />;
  }

  if (schema.isLoading) {
    return (
      <main className="cr-page" data-ds="page">
        <p className="caption" role="status">
          Loading the form…
        </p>
      </main>
    );
  }

  if (schema.isError || !schema.data) {
    return (
      <main className="cr-page" data-ds="page">
        <p className="mws-alert mws-alert--error" role="alert">
          This form could not be loaded. Try again in a moment.
        </p>
      </main>
    );
  }

  const title = `New ${object.name}`;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTriedSubmit(true);
    const validation = validateFieldForm(userFields, values);
    const missingName = !name.trim();
    setErrors(validation);
    setNameError(missingName ? 'Name is required.' : undefined);
    if (missingName || Object.keys(validation).length > 0) return;

    try {
      const created = await create.mutateAsync({ name: name.trim(), fields: values });
      navigate(`/objects/${objectKey}/${created.id}`);
    } catch {
      // Surfaced via the inline alert (create.isError). No rethrow.
    }
  };

  return (
    <main className="cr-page" data-ds="page">
      <h1 className="h2">{title}</h1>

      <form className="cr-form" onSubmit={handleSubmit} noValidate aria-label={title}>
        <TextField
          label="Name"
          value={name}
          onChange={(value) => setName(value)}
          error={triedSubmit ? nameError : undefined}
        />

        {sections.map((group) => {
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
                    onChange={(value) => setField(field.fieldKey, value)}
                    required={conditions.required.has(field.fieldKey)}
                    error={triedSubmit ? errors[field.fieldKey] : undefined}
                    suggest={{
                      workspaceId: workspaceId as WorkspaceId,
                      objectType: object.objectKey,
                      siblingValues: values,
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {create.isError && (
          <p className="mws-alert mws-alert--error" role="alert">
            This record could not be created. Try again in a moment.
          </p>
        )}

        <div className="cr-actions">
          <Button variant="secondary" onClick={() => navigate(`/objects/${objectKey}`)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={create.isPending}>
            Create record
          </Button>
        </div>
      </form>
    </main>
  );
}
