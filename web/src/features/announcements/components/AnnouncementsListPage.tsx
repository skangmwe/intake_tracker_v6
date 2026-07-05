// Announcements list (S22) — a browsable history of the announcements the caller can see (Published,
// in-audience, across their workspaces). Pinned first, then most recent. Each row opens the detail
// (S21). Renders explicit loading / error / empty states (web-component-architecture.md).

import { Link } from 'react-router-dom';
import { PushPin } from '@phosphor-icons/react';

import { useAnnouncementsFeed } from '../useAnnouncements';

export function AnnouncementsListPage() {
  const feed = useAnnouncementsFeed(1);
  const items = feed.data?.items ?? [];

  return (
    <div className="ann-page">
      <header className="ann-page__header">
        <div>
          <h1 className="h2">Announcements</h1>
          <p className="body">News and notices for your workspaces.</p>
        </div>
      </header>

      {feed.isLoading && <p className="caption" role="status">Loading announcements…</p>}
      {feed.isError && (
        <p className="mws-alert mws-alert--error" role="alert">We couldn’t load announcements. Try again in a moment.</p>
      )}

      {feed.data && items.length === 0 && (
        <section className="mws-empty mws-empty--zero" aria-labelledby="ann-feed-empty">
          <h2 id="ann-feed-empty" className="h3">No announcements yet</h2>
          <p className="body">When your workspace posts news, it will show up here and in your bell.</p>
        </section>
      )}

      {items.length > 0 && (
        <ul className="ann-list">
          {items.map((row) => {
            const published = row.publishedAt
              ? new Date(row.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
              : '';
            return (
              <li key={row.id} className="ann-row" data-ds="card">
                <div className="ann-row__main">
                  <div className="ann-row__title-line">
                    <Link className="ann-row__title mws-link" to={`/announcements/${row.id}`}>
                      {row.title}
                    </Link>
                    {row.pinned && (
                      <span className="ann-row__pin">
                        <PushPin size={14} weight="regular" aria-hidden />
                        Pinned
                      </span>
                    )}
                  </div>
                  <p className="ann-row__snippet">{row.bodySnippet}</p>
                  {published && <span className="caption">Published {published}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
