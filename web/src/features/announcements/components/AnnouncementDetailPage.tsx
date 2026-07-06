// Announcement detail (S21) — read one announcement. Title, body, author, published date, expiry,
// status. A 403 (the caller isn't in the audience) renders a no-access message that never reveals
// whether the announcement exists (BS §22.6). Body is rendered as plain text with preserved line
// breaks — not as HTML — because no sanitizer is wired yet (web-coding-standards.md: never pass
// user-supplied content to dangerouslySetInnerHTML). Loading / error / no-access states are explicit.

import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';

import { NoAccessPage } from '@/shared/components/EdgeStates';
import { ApiError } from '@/shared/http/apiClient';

import { useAnnouncement } from '../useAnnouncements';
import { AnnouncementStatusBadge } from './AnnouncementStatusBadge';

const formatDate = (iso?: string): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useAnnouncement(id);

  const backLink = (
    <Link className="mws-link ann-detail__back" to="/announcements">
      <ArrowLeft size={16} weight="regular" aria-hidden />
      Back to announcements
    </Link>
  );

  if (query.isLoading) {
    return (
      <div className="ann-page">
        {backLink}
        <p className="caption" role="status">Loading the announcement…</p>
      </div>
    );
  }

  if (query.isError) {
    const isForbidden = query.error instanceof ApiError && query.error.status === 403;
    if (isForbidden) {
      return <NoAccessPage resourceNoun="announcement" />;
    }
    return (
      <div className="ann-page">
        {backLink}
        <section className="mws-empty mws-empty--filtered" aria-labelledby="ann-detail-error">
          <h1 id="ann-detail-error" className="h2">Announcement unavailable</h1>
          <p className="body">We couldn’t load this announcement. Try again in a moment.</p>
        </section>
      </div>
    );
  }

  const announcement = query.data;
  if (!announcement) {
    return (
      <div className="ann-page">
        {backLink}
        <p className="caption" role="status">Loading the announcement…</p>
      </div>
    );
  }

  const published = formatDate(announcement.publishedAt);
  const expires = formatDate(announcement.expiresOn);

  return (
    <article className="ann-page ann-detail">
      {backLink}
      <div className="ann-detail__head">
        <h1 className="h1">{announcement.title}</h1>
        <AnnouncementStatusBadge status={announcement.status} />
      </div>
      <p className="caption ann-detail__meta">
        {published ? `Published ${published}` : 'Not yet published'}
        {expires ? ` · Expires ${expires}` : ''}
      </p>
      <div className="ann-detail__body body">{announcement.body}</div>
    </article>
  );
}
