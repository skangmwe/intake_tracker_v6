// Notifications bell (top bar — S20). The popover surfaces the caller's real notification feed with a
// badge for the unread count, a "Mark all read" action, and per-item mark-read + navigate-to-record.
// "Announcement history" opens the announcements list (S22); an announcement-posted row deep-links to
// the announcement (S21). The feed only loads while the popover is open (the
// query's `enabled` flag). Live regions announce loading + empty; the unread count is folded into the
// bell's accessible name so screen-reader users hear it.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Megaphone } from '@phosphor-icons/react';

import type { NotificationDto } from '@shared/types';

import { IconButton } from '@/shared/components/Button/IconButton';
import { useDismissable } from '@/shared/hooks/useDismissable';
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotificationsFeed,
  useUnreadCount,
} from '@/features/notifications';

/** Short relative time — "just now", "3m", "3h", "2d", else a short date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMinutes = Math.floor((now - then) / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function BellMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useDismissable<HTMLSpanElement>(open, () => setOpen(false));

  const { data: unread } = useUnreadCount();
  const feed = useNotificationsFeed(open);
  const markAll = useMarkAllRead();
  const markOne = useMarkNotificationRead();

  const count = unread?.count ?? 0;
  const items = feed.data?.items ?? [];
  const label = count > 0 ? `Notifications, ${count} unread` : 'Notifications';

  const openNotification = (notification: NotificationDto) => {
    markOne.mutate(notification.id);
    setOpen(false);
    if (notification.announcementId) {
      navigate(`/announcements/${notification.announcementId}`);
    } else if (notification.recordId) {
      navigate(`/requests/${notification.recordId}`);
    }
  };

  return (
    <span className="ast-menu-anchor" ref={ref}>
      <IconButton
        icon={Bell}
        label={label}
        ariaHasPopup="true"
        ariaExpanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      {count > 0 && (
        <span className="ast-bell__badge" aria-hidden>
          {count > 99 ? '99+' : count}
        </span>
      )}
      {open && (
        <div className="ast-menu ast-menu--bell" aria-label="Notifications">
          <div className="ast-menu__header">
            <span className="ast-menu__title">Notifications</span>
            {count > 0 && (
              <button
                type="button"
                className="ast-menu__link"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                Mark all read
              </button>
            )}
          </div>

          {feed.isLoading && (
            <p className="ast-menu__note" role="status">
              Loading notifications…
            </p>
          )}
          {feed.isError && (
            <p className="ast-menu__note" role="status">
              Notifications couldn’t be loaded. Try again in a moment.
            </p>
          )}
          {!feed.isLoading && !feed.isError && items.length === 0 && (
            <p className="ast-menu__note">You’re all caught up.</p>
          )}

          {items.length > 0 && (
            <ul className="ast-notif-list">
              {items.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    className={`ast-notif${notification.readAt ? '' : ' ast-notif--unread'}`}
                    onClick={() => openNotification(notification)}
                  >
                    {!notification.readAt && <span className="ast-notif__dot" aria-hidden />}
                    <span className="ast-notif__body">
                      <span className="ast-notif__summary">{notification.summary}</span>
                      <span className="ast-notif__time">{relativeTime(notification.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="ast-menu__item"
            onClick={() => {
              setOpen(false);
              navigate('/announcements');
            }}
          >
            <Megaphone size={18} weight="regular" aria-hidden />
            Announcement history
          </button>
        </div>
      )}
    </span>
  );
}
