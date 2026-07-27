// Time-based triggers admin surface (slice: triggers-request-authoring, Task 2.3). A workspace admin
// manages the scheduled triggers that chase requests against conditions they author. Gates on
// workspace-admin membership of the active workspace (mirrors FieldsAdminPage / UsersAccessPage);
// the list + editor live in TriggersList. The surface title/lead render in the shared SideNavLayout
// header.

import { useMe } from '@/features/users/useMe';
import { useActiveWorkspaceId } from '@/shared/workspace/ActiveWorkspaceContext';

import { TriggersList } from './TriggersList';

export function TriggersAdminPage() {
  const { data: me, isLoading: isMeLoading, isError: isMeError } = useMe();
  const workspaceId = useActiveWorkspaceId();
  const isAdmin = (me?.memberships ?? []).some(
    (membership) => membership.workspaceId === workspaceId && membership.level === 'WorkspaceAdmin',
  );

  if (isMeLoading && !me) {
    return (
      <p className="caption" role="status">
        Loading your workspaces…
      </p>
    );
  }

  if (isMeError && !me) {
    return (
      <p className="mws-alert mws-alert--error" role="alert">
        We couldn’t load your access. Try again in a moment.
      </p>
    );
  }

  if (!workspaceId || !isAdmin) {
    return (
      <section className="mws-empty mws-empty--zero">
        <p className="body">
          You need to be a workspace admin to manage triggers. Ask an admin to grant access.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Triggers">
      <TriggersList workspaceId={workspaceId} />
    </section>
  );
}
