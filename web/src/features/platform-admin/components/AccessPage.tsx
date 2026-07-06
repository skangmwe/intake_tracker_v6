// S36 Access provisioning — the firm's privileged-grants directory (Platform-admin holders +
// WorkspaceAdmin holders) with grant and revoke of the additive Platform-admin grant (BS §4.2/§4.3).
// WorkspaceAdmin rows are read-only here (managed in Users & access). Renders the three non-data
// states explicitly; the page owns the revoke confirm dialog.

import { useState } from 'react';

import type { PrivilegedGrantDto } from '@shared/types';

import { PlatformGate } from './PlatformGate';
import { GrantAccessForm } from './GrantAccessForm';
import { PrivilegedGrantsTable } from './PrivilegedGrantsTable';
import { RevokeGrantDialog } from './RevokeGrantDialog';
import { useAccessGrants, useRevokeAccess } from '../useAccessGrants';
import { usePlatformAdmin } from '../usePlatformAdmin';

function AccessSurface() {
  const { data, isLoading, isError } = useAccessGrants(true);
  const revoke = useRevokeAccess();
  const [toRevoke, setToRevoke] = useState<PrivilegedGrantDto | null>(null);

  const openRevoke = (grant: PrivilegedGrantDto) => {
    revoke.reset();
    setToRevoke(grant);
  };

  const cancelRevoke = () => {
    revoke.reset();
    setToRevoke(null);
  };

  const confirmRevoke = () => {
    if (!toRevoke) return;
    revoke.mutate(toRevoke.userId, { onSuccess: () => setToRevoke(null) });
  };

  return (
    <>
      <GrantAccessForm />

      {isLoading && (
        <p className="caption" role="status">
          Loading privileged grants…
        </p>
      )}

      {isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The privileged-grants directory could not be loaded. Try again in a moment.
        </p>
      )}

      {data && data.grants.length === 0 && (
        <p className="platform-admin__empty">No privileged grants yet.</p>
      )}

      {data && data.grants.length > 0 && (
        <PrivilegedGrantsTable grants={data.grants} onRevoke={openRevoke} />
      )}

      {toRevoke && (
        <RevokeGrantDialog
          grant={toRevoke}
          onConfirm={confirmRevoke}
          onCancel={cancelRevoke}
          isPending={revoke.isPending}
          error={revoke.isError ? revoke.error : null}
        />
      )}
    </>
  );
}

export function AccessPage() {
  const { isPlatformAdmin } = usePlatformAdmin();

  return (
    <PlatformGate
      title="Access provisioning"
      lead="Who holds firm-wide Platform-admin access and which workspaces have admins."
    >
      {isPlatformAdmin && <AccessSurface />}
    </PlatformGate>
  );
}
