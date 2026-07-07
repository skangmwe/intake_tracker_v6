// S16 Dashboard-viewer — the read-only surface for a user bound to a single dashboard. Renders the
// generic DashboardSurface with drill-through suppressed (the API returns supportsDrillThrough=false on
// this path, so the surface disables every click and shows no drill rail). No pin, no interactivity —
// just the dashboard's widgets resolved to the caller. A 403/404 renders the uniform no-access surface.

import type { SavedDashboardId } from '@shared/types';

import { ApiError } from '@/shared/http/apiClient';
import { NoAccessPage } from '@/shared/components/EdgeStates';

import { useDashboard } from '../useDashboards';
import { DashboardSurface } from './DashboardSurface';

interface DashboardViewerPageProps {
  dashboardId: SavedDashboardId;
}

export function DashboardViewerPage({ dashboardId }: DashboardViewerPageProps) {
  const { data, isLoading, isError, error } = useDashboard(dashboardId);

  if (isError && error instanceof ApiError && (error.status === 403 || error.status === 404)) {
    return <NoAccessPage resourceNoun="dashboard" homeTo="/" />;
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

  const header = (
    <div className="dash__head">
      <h1 id="dash-heading" className="dash__title">
        {data.name}
      </h1>
      {data.description && <span className="dash__subtitle">{data.description}</span>}
    </div>
  );

  return <DashboardSurface dashboard={data} header={header} />;
}
