// The pinned-announcement slim strip at the top of Home (S1). Shows the freshest pinned announcement
// with a link to the full announcement history. Renders nothing when there is no pinned announcement.

import { PushPin } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { HomePinnedAnnouncement } from '@shared/types';

interface PinnedStripProps {
  announcements: readonly HomePinnedAnnouncement[];
}

export function PinnedStrip({ announcements }: PinnedStripProps) {
  const top = announcements[0];
  if (!top) {
    return null;
  }

  return (
    <div className="home-strip" role="note">
      <PushPin className="home-strip__icon" size={16} weight="regular" aria-hidden="true" />
      <span className="home-strip__text">
        <strong>{top.title}</strong> {top.bodySnippet}
      </span>
      <Link className="home-strip__link mws-link" to="/announcements">
        Announcement history
      </Link>
    </div>
  );
}
