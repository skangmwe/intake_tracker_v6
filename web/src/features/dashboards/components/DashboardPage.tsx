// The full dashboard route (`/dashboards/:id`) — S6 (ai-default) and, generically, S14/S12/S15. Owns the
// drill-through state (a click on a widget re-scopes the embedded grid by refetching with ?drill=…),
// resolves the dashboard for the caller, and renders the generic DashboardSurface. The ai-default slug
// gets the prototype's exact heading ("Dashboard" + Pin-as-home + seeded-default subtitle); every other
// dashboard shows its own name + description. A 403/404 renders the uniform no-access surface (S40).

import { useState } from 'react';
import { useParams } from 'react-router-dom';

import type { DashboardDrillFilter, SavedDashboardId } from '@shared/types';

import { ApiError } from '@/shared/http/apiClient';
import { NoAccessPage } from '@/shared/components/EdgeStates';

import { useDashboard } from '../useDashboards';
import { DashboardSurface } from './DashboardSurface';
import { DashPinButton } from './DashPinButton';

export function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  // Route params are plain strings; SavedDashboardId is a compile-time brand, so the id needs a cast.
  const dashboardId = (id ?? null) as SavedDashboardId | null;
  const [drill, setDrill] = useState<DashboardDrillFilter | undefined>(undefined);

  const { data, isLoading, isError, error } = useDashboard(dashboardId, drill);

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

  const isAiDefault = data.slug === 'ai-default';
  const heading = isAiDefault ? 'Dashboard' : data.name;
  const subtitle = isAiDefault
    ? 'AI Solutions workspace · seeded default'
    : (data.description ?? undefined);

  const header = (
    <div className="dash__head">
      <h1 id="dash-heading" className="dash__title">
        {heading}
      </h1>
      {isAiDefault && <DashPinButton />}
      {subtitle && <span className="dash__subtitle">{subtitle}</span>}
    </div>
  );

  return (
    <DashboardSurface
      dashboard={data}
      header={header}
      drill={drill}
      onDrill={setDrill}
      onClearDrill={() => setDrill(undefined)}
    />
  );
}
