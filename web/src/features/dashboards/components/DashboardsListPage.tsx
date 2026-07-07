// S17 Dashboards list — the dashboards visible to the caller in the active workspace. Each row links to
// the full surface (`/dashboards/:id`); the default dashboard is badged and sorted first by the API. A
// user bound to a single dashboard (Dashboard-viewer) is redirected to the read-only S16 viewer instead
// of the list. Renders explicit loading / error / no-workspace / empty states (web-component-architecture.md).

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChartBar, CaretRight } from '@phosphor-icons/react';

import type { AnnouncementAudienceKind, DashboardListItemDto } from '@shared/types';

import { StatusPill } from '@/shared/components/Feedback';
import { EmptyListZeroData } from '@/shared/components/EdgeStates';
import { useMe } from '@/features/users/useMe';
import { resolveActiveWorkspaceId } from '@/shared/workspace/activeWorkspace';

import { useDashboardList } from '../useDashboards';
import { DashboardViewerPage } from './DashboardViewerPage';

const AUDIENCE_LABEL: Record<AnnouncementAudienceKind, string> = {
  everyone: 'Everyone',
  'role-scoped': 'Role-scoped',
  'named-users': 'Named users',
};

function DashboardRow({ item }: { item: DashboardListItemDto }) {
  return (
    <li>
      <Link to={`/dashboards/${item.id}`} className="dash-list__row">
        <ChartBar size={20} weight="regular" aria-hidden className="dash-list__icon" />
        <span className="dash-list__main">
          <span className="dash-list__name">
            <span className="dash-list__name-text">{item.name}</span>
            {item.isDefault && <StatusPill status="success" label="Default" />}
          </span>
          {item.description && <span className="dash-list__desc">{item.description}</span>}
        </span>
        <span className="dash-list__meta">
          {AUDIENCE_LABEL[item.audience.kind]} · {item.widgetCount} widget
          {item.widgetCount === 1 ? '' : 's'}
        </span>
        <CaretRight size={16} weight="regular" aria-hidden className="dash-list__caret" />
      </Link>
    </li>
  );
}

export function DashboardsListPage() {
  const { data: me, isLoading: meLoading, isError: meError } = useMe();
  const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);
  const boundDashboardId = me?.boundDashboardId ?? null;

  const list = useDashboardList(boundDashboardId ? null : workspaceId);

  // A user bound to a single dashboard sees only that dashboard, read-only (S16).
  if (boundDashboardId) {
    return <DashboardViewerPage dashboardId={boundDashboardId} />;
  }

  const title = (
    <h1 id="dash-list-heading" className="h1 dash-list__title">
      Dashboards
    </h1>
  );

  if (meLoading || (workspaceId && list.isLoading)) {
    return (
      <section className="dash-list" aria-labelledby="dash-list-heading">
        {title}
        <p className="caption" role="status">
          Loading dashboards…
        </p>
      </section>
    );
  }

  if (meError || list.isError || !workspaceId) {
    return (
      <section className="dash-list" aria-labelledby="dash-list-heading">
        {title}
        <p className="mws-alert mws-alert--error" role="alert">
          Dashboards could not be loaded. Try again in a moment.
        </p>
      </section>
    );
  }

  const items = list.data?.items ?? [];

  return (
    <section className="dash-list" aria-labelledby="dash-list-heading">
      {title}
      <p className="dash-list__lead">
        The dashboards shared in this workspace. Open one to explore its metrics and drill into the
        records behind them.
      </p>

      {items.length === 0 ? (
        <EmptyListZeroData
          icon={ChartBar}
          title="No dashboards yet"
          message="Seeded dashboards appear here once the workspace is provisioned."
        />
      ) : (
        <ul className="dash-list__rows">
          {items.map((item) => (
            <DashboardRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
