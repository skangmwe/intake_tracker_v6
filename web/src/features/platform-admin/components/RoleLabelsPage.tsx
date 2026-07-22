// S37 Role-label catalog — the platform-scope list of gate role labels S31's approver-slot selectors
// draw from (BS §7.2). Add, rename, and retire (all forward-only). Renders the three non-data states
// explicitly; the page owns the retire confirm dialog while each row owns its inline rename.

import { useState } from 'react';

import type { RoleLabelDto } from '@shared/types';

import { PlatformGate } from './PlatformGate';
import { AddRoleLabelForm } from './AddRoleLabelForm';
import { RoleLabelRow } from './RoleLabelRow';
import { RetireRoleLabelDialog } from './RetireRoleLabelDialog';
import { useRetireRoleLabel, useRoleLabels } from '../useRoleLabels';
import { usePlatformAdmin } from '../usePlatformAdmin';

function RoleLabelsSurface() {
  const { data, isLoading, isError } = useRoleLabels(true);
  const retire = useRetireRoleLabel();
  const [toRetire, setToRetire] = useState<RoleLabelDto | null>(null);

  const openRetire = (label: RoleLabelDto) => {
    retire.reset();
    setToRetire(label);
  };

  const cancelRetire = () => {
    retire.reset();
    setToRetire(null);
  };

  const confirmRetire = () => {
    if (!toRetire) return;
    retire.mutate(toRetire.roleLabelId, { onSuccess: () => setToRetire(null) });
  };

  return (
    <>
      <AddRoleLabelForm />

      {isLoading && (
        <p className="caption" role="status">
          Loading role labels…
        </p>
      )}

      {isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The role-label catalog could not be loaded. Try again in a moment.
        </p>
      )}

      {data && data.length === 0 && (
        <p className="platform-admin__empty">No role labels yet. Add one above.</p>
      )}

      {data && data.length > 0 && (
        <ul className="platform-admin__label-list" aria-label="Role labels">
          {data.map((label) => (
            <RoleLabelRow key={label.roleLabelId} label={label} onRetire={openRetire} />
          ))}
        </ul>
      )}

      {toRetire && (
        <RetireRoleLabelDialog
          label={toRetire}
          onConfirm={confirmRetire}
          onCancel={cancelRetire}
          isPending={retire.isPending}
          error={retire.isError ? retire.error : null}
        />
      )}
    </>
  );
}

export function RoleLabelsPage() {
  const { isPlatformAdmin } = usePlatformAdmin();

  return <PlatformGate>{isPlatformAdmin && <RoleLabelsSurface />}</PlatformGate>;
}
