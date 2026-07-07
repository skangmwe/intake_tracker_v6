// S32 shared-dashboards management (BS §10.5, §22). The WorkspaceAdmin panel that lists the workspace's
// shared dashboards and, per item, edits the audience / name or retires it — both through PATCH
// /dashboards/{id}, which the API enforces as WorkspaceAdmin. Promote-from-personal is N/A in R1 (there
// are no personal dashboards). Rendered inside the S32 Views & dashboards surface. Renders explicit
// loading / error / empty states (web-component-architecture.md).

import { useState } from 'react';

import type { DashboardListItemDto, DashboardPatchRequest, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { StatusPill } from '@/shared/components/Feedback';
import { problemMessage } from '@/shared/http/problemMessage';

import { useDashboardList, usePatchDashboard } from '../useDashboards';
import { summarizeAudience } from '../dashboardsAdminModel';
import { EditDashboardAudienceDialog } from './EditDashboardAudienceDialog';
import { RetireDashboardDialog } from './RetireDashboardDialog';

interface DashboardsManagementSectionProps {
  workspaceId: WorkspaceId;
}

export function DashboardsManagementSection({ workspaceId }: DashboardsManagementSectionProps) {
  const list = useDashboardList(workspaceId);
  const patch = usePatchDashboard(workspaceId);
  const [editing, setEditing] = useState<DashboardListItemDto | null>(null);
  const [retiring, setRetiring] = useState<DashboardListItemDto | null>(null);

  const saveEdit = (request: DashboardPatchRequest) => {
    if (!editing) return;
    patch.mutate({ dashboardId: editing.id, request }, { onSuccess: () => setEditing(null) });
  };

  const confirmRetire = () => {
    if (!retiring) return;
    patch.mutate(
      { dashboardId: retiring.id, request: { retire: true } },
      { onSuccess: () => setRetiring(null) },
    );
  };

  const items = list.data?.items ?? [];

  return (
    <section className="views-admin__section" aria-labelledby="dashboards-management">
      <h2 id="dashboards-management" className="h3 views-admin__section-title">
        Shared dashboards
      </h2>

      {list.isLoading && (
        <p className="caption" role="status">
          Loading dashboards…
        </p>
      )}

      {list.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          These dashboards could not be loaded. Try again in a moment.
        </p>
      )}

      {list.data && items.length === 0 && (
        <p className="views-admin__empty">No shared dashboards in this workspace yet.</p>
      )}

      {items.length > 0 && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a horizontally-scrollable region must be keyboard-focusable so keyboard users can scroll it (axe scrollable-region-focusable).
        <div className="dash-admin__table-shell" tabIndex={0} role="region" aria-label="Shared dashboards table">
          <table className="dash-admin__table">
            <thead>
              <tr>
                <th scope="col">Dashboard</th>
                <th scope="col">Audience</th>
                <th scope="col">Default</th>
                <th scope="col" className="dash-admin__col-action">
                  <span className="mws-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="dash-admin__name">{item.name}</td>
                  <td>{summarizeAudience(item.audience)}</td>
                  <td>{item.isDefault ? <StatusPill status="success" label="Default" /> : '—'}</td>
                  <td className="dash-admin__col-action">
                    <Button variant="secondary" compact onClick={() => setEditing(item)}>
                      Edit sharing
                    </Button>
                    <Button variant="destructive" compact onClick={() => setRetiring(item)}>
                      Retire
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditDashboardAudienceDialog
          dashboard={editing}
          onSave={saveEdit}
          onCancel={() => {
            patch.reset();
            setEditing(null);
          }}
          isPending={patch.isPending}
          error={patch.isError ? patch.error : null}
        />
      )}

      {retiring && (
        <RetireDashboardDialog
          dashboard={retiring}
          onConfirm={confirmRetire}
          onCancel={() => {
            patch.reset();
            setRetiring(null);
          }}
          isPending={patch.isPending}
          error={patch.isError ? patch.error : null}
        />
      )}
    </section>
  );
}
