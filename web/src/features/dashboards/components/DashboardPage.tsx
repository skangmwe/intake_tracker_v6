// The full dashboard route (`/dashboards/:id`) — the S6 multi-dashboard surface (slice 28) and,
// generically, S14/S12/S15. A DashboardSwitcher header lets the caller switch between the workspace's
// Shared / Personal dashboards or create a new one; the body renders either the seeded fixed layout
// (DashboardSurface, with drill-through) or the composed canvas (ComposedDashboardSurface, with
// edit-layout mode). A 403/404 renders the uniform no-access surface (S40).

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type {
  DashboardComposeRequest,
  DashboardDrillFilter,
  SavedDashboardId,
} from '@shared/types';

import { ApiError } from '@/shared/http/apiClient';
import { NoAccessPage } from '@/shared/components/EdgeStates';

import { useComposerScopeOptions } from '../useComposerScopeOptions';
import { useCreateDashboard, useDashboard, useDashboardList } from '../useDashboards';
import { DashboardSurface } from './DashboardSurface';
import { DashboardSwitcher } from './DashboardSwitcher';
import { ComposedDashboardSurface } from './ComposedDashboardSurface';
import { NewDashboardSheet } from './NewDashboardSheet';

export function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Route params are plain strings; SavedDashboardId is a compile-time brand, so the id needs a cast.
  const dashboardId = (id ?? null) as SavedDashboardId | null;

  const [drill, setDrill] = useState<DashboardDrillFilter | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [newSheetOpen, setNewSheetOpen] = useState(false);

  const { data, isLoading, isError, error } = useDashboard(dashboardId, drill);
  const workspaceId = data?.workspaceId ?? null;
  const list = useDashboardList(workspaceId);
  const scope = useComposerScopeOptions(workspaceId ?? undefined);
  const createDashboard = useCreateDashboard(workspaceId);

  if (isError && error instanceof ApiError && (error.status === 403 || error.status === 404)) {
    return <NoAccessPage resourceNoun="dashboard" homeTo="/dashboards" />;
  }

  if (isLoading || !data) {
    return (
      <section className="dash" aria-labelledby="dash-heading">
        <div className="dash__head">
          <h1 id="dash-heading" className="dash__title">
            Dashboard
          </h1>
        </div>
        {isError ? (
          <p className="mws-alert mws-alert--error" role="alert">
            This dashboard could not be loaded. Try again in a moment.
          </p>
        ) : (
          <p className="caption" role="status">
            Loading dashboard…
          </p>
        )}
      </section>
    );
  }

  const switchTo = (nextId: SavedDashboardId) => {
    setEditing(false);
    setDrill(undefined);
    navigate(`/dashboards/${nextId}`);
  };

  const create = (request: DashboardComposeRequest) => {
    createDashboard.mutate(request, {
      onSuccess: (dashboard) => {
        setNewSheetOpen(false);
        setEditing(true);
        navigate(`/dashboards/${dashboard.id}`);
      },
    });
  };

  const switcher = (
    <DashboardSwitcher
      active={data}
      dashboards={list.data?.items ?? []}
      onPick={switchTo}
      onNew={() => setNewSheetOpen(true)}
      editing={editing}
      onToggleEditing={() => setEditing((prev) => !prev)}
    />
  );

  const newSheet = newSheetOpen && (
    <NewDashboardSheet
      onCreate={create}
      onClose={() => {
        createDashboard.reset();
        setNewSheetOpen(false);
      }}
      isPending={createDashboard.isPending}
      error={createDashboard.isError ? 'This dashboard could not be created. Try again.' : null}
    />
  );

  if (data.layoutMode === 'Composed') {
    return (
      <section className="dash" aria-labelledby="dash-heading">
        {switcher}
        <ComposedDashboardSurface
          dashboard={data}
          workspaceId={workspaceId}
          editing={editing}
          scope={scope}
        />
        {newSheet}
      </section>
    );
  }

  return (
    <>
      <DashboardSurface
        dashboard={data}
        header={switcher}
        drill={drill}
        onDrill={setDrill}
        onClearDrill={() => setDrill(undefined)}
      />
      {newSheet}
    </>
  );
}
