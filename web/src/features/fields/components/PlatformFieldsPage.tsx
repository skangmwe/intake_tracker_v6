// Platform field schema surface (S34). A Platform admin edits the central definitions — system
// fields, AI Solutions Status, Legacy ID. Edits apply to every workspace at once (§4.3). Non-admins
// get a no-access response that never leaks the data. Renders explicit loading / error / empty states.

import type { PlatformFieldDto } from '@shared/types';

import { useMe } from '@/features/users/useMe';

import { problemMessage } from '../errorMessage';
import { usePlatformFields, useUpdatePlatformField } from '../useFields';
import { PlatformFieldRow } from './PlatformFieldRow';

export function PlatformFieldsPage() {
  const { data: me, isLoading: isMeLoading } = useMe();
  const isPlatformAdmin = me?.isPlatformAdmin ?? false;

  const { data: fields, isLoading, isError } = usePlatformFields(isPlatformAdmin);
  const updateField = useUpdatePlatformField();

  if (isMeLoading && !me) {
    return <p className="caption" role="status">Loading…</p>;
  }

  if (!isPlatformAdmin) {
    return (
      <section className="mws-empty mws-empty--zero" aria-labelledby="platform-no-access">
        <h1 id="platform-no-access" className="h2">Platform field schema</h1>
        <p className="body">You don’t have access to this. Ask a Platform admin if you need a change to the central field schema.</p>
      </section>
    );
  }

  const onSave = (fieldKey: string, displayName: string, selectOptions: string[] | null) =>
    updateField.mutate({ fieldKey, request: { displayName, selectOptions } });

  return (
    <section aria-labelledby="platform-fields-heading">
      <header className="fields-header">
        <div>
          <h1 id="platform-fields-heading" className="h2">Platform field schema</h1>
          <p className="body">Central field definitions referenced by every workspace. Changes apply firm-wide.</p>
        </div>
      </header>

      {updateField.isError && (
        <p className="mws-alert mws-alert--error" role="alert">{problemMessage(updateField.error)}</p>
      )}

      {isLoading && <p className="caption" role="status">Loading platform fields…</p>}
      {isError && <p className="mws-alert mws-alert--error" role="alert">We couldn’t load the platform fields. Try again in a moment.</p>}

      {fields && !isLoading && (
        fields.length > 0 ? (
          <ul className="fields-platform-list" aria-label="Platform fields">
            {fields.map((field: PlatformFieldDto) => (
              <PlatformFieldRow key={field.id} field={field} isSaving={updateField.isPending} onSave={onSave} />
            ))}
          </ul>
        ) : (
          <div className="mws-empty mws-empty--filtered">
            <p className="body">No platform fields are defined.</p>
          </div>
        )
      )}
    </section>
  );
}
