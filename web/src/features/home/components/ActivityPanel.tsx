// "Since you were last here" panel (S1) — record activity since the caller's prior Home visit. Each
// row shows an event icon, a plain-language line (actor + event + record), and a relative time. Rows
// with a record open it; a record-less event (rare here) is a non-navigable line.

import { Link } from 'react-router-dom';
import type { HomeActivityItem } from '@shared/types';

import { activityPresentation, formatRelative, formatSince } from '../homeFormat';
import { HomePanel } from './HomePanel';

interface ActivityPanelProps {
  items: readonly HomeActivityItem[];
  sinceLastSeenAt: string | null;
}

export function ActivityPanel({ items, sinceLastSeenAt }: ActivityPanelProps) {
  return (
    <HomePanel
      title="Since you were last here"
      meta={`Since ${formatSince(sinceLastSeenAt)}`}
      isEmpty={items.length === 0}
      emptyLabel="No activity since your last visit."
    >
      <ul className="home-list">
        {items.map((item, index) => {
          const { Icon, label } = activityPresentation(item.eventType);
          const line = (
            <>
              <Icon className="home-activity__icon" size={20} weight="regular" aria-hidden="true" />
              <span className="home-activity__text">
                <strong>{item.actorName ?? 'Someone'}</strong> {label.toLowerCase()}
                {item.recordId ? (
                  <>
                    {' '}
                    <span className="home-row__id">{item.recordId}</span>
                    {item.name ? <> — {item.name}</> : null}
                  </>
                ) : null}
              </span>
              <span className="home-row__trail">{formatRelative(item.eventAt)}</span>
            </>
          );
          return (
            <li key={`${item.recordId ?? 'evt'}-${item.eventAt}-${index}`}>
              {item.recordId ? (
                <Link className="home-row home-activity" to={`/requests/${item.recordId}`}>
                  {line}
                </Link>
              ) : (
                <span className="home-row home-activity home-activity--static">{line}</span>
              )}
            </li>
          );
        })}
      </ul>
    </HomePanel>
  );
}
