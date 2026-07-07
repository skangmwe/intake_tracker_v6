// S32 edit-audience dialog — a WorkspaceAdmin edits a shared dashboard's name and who it fans out to
// (everyone / role-scoped / named-users). Role-scoped exposes a comma-separated role-labels field;
// named-users has no picker in R1 (no personal dashboards) so its members pass through unchanged. Saves
// via PATCH /dashboards/{id}; a failure renders inline (disclosure-surfaces.md modal pattern).

import { useState } from 'react';

import type {
  AnnouncementAudienceKind,
  DashboardListItemDto,
  DashboardPatchRequest,
} from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';
import { Select, TextField } from '@/shared/components/Form';
import { problemMessage } from '@/shared/http/problemMessage';

import { AUDIENCE_KIND_LABEL, buildAudience, roleLabelsToText } from '../dashboardsAdminModel';

// Object.keys() widens to string[]; the map's keys are exactly the audience kinds, so the cast is safe.
const KIND_OPTIONS = (Object.keys(AUDIENCE_KIND_LABEL) as AnnouncementAudienceKind[]).map((kind) => ({
  value: kind,
  label: AUDIENCE_KIND_LABEL[kind],
}));

interface EditDashboardAudienceDialogProps {
  dashboard: DashboardListItemDto;
  onSave: (request: DashboardPatchRequest) => void;
  onCancel: () => void;
  isPending: boolean;
  error: unknown;
}

export function EditDashboardAudienceDialog({
  dashboard,
  onSave,
  onCancel,
  isPending,
  error,
}: EditDashboardAudienceDialogProps) {
  const [name, setName] = useState(dashboard.name);
  const [kind, setKind] = useState<AnnouncementAudienceKind>(dashboard.audience.kind);
  const [roleLabels, setRoleLabels] = useState(roleLabelsToText(dashboard.audience));

  const save = () => {
    const trimmed = name.trim();
    onSave({
      name: trimmed || dashboard.name,
      audience: buildAudience(kind, roleLabels, dashboard.audience),
    });
  };

  return (
    <Modal
      title="Edit dashboard sharing"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="dash-admin__form">
        <TextField label="Dashboard name" value={name} onChange={setName} />
        <Select
          label="Audience"
          value={kind}
          // The select's option values are exactly the audience kinds, so the value is always a kind.
          onChange={(value) => setKind(value as AnnouncementAudienceKind)}
          options={KIND_OPTIONS}
          hint="Who this dashboard is shared with. A dashboard never widens a viewer's record access."
        />
        {kind === 'role-scoped' && (
          <TextField
            label="Role labels"
            value={roleLabels}
            onChange={setRoleLabels}
            placeholder="Analyst, Reviewer"
            hint="Comma-separated role labels this dashboard is shared with."
          />
        )}
        {kind === 'named-users' && (
          <p className="dash-admin__note">
            Named-user membership is managed elsewhere in R1 — the current members are kept as-is.
          </p>
        )}
      </div>
      {error != null && (
        <p className="mws-alert mws-alert--error dash-admin__error" role="alert">
          {problemMessage(error)}
        </p>
      )}
    </Modal>
  );
}
