// Watchers card — the S4/S5 Watchers & alerts tab (BS §17.3, §11.2). Two cards, per the prototype:
// (1) Watchers — the live roster (avatar initials + name) with a Watch / Watching self-toggle;
// (2) Notify watchers about — a static list of the firm-default notification rules. Renders explicit
// loading / error / empty states (web-component-architecture.md). The toggle subscribes or
// unsubscribes the caller; the API is the authority on visibility (this card only renders for a
// record the caller can already see — a 403 surfaces as the no-access record page upstream).

import { Bell, Eye, EyeSlash } from '@phosphor-icons/react';

import type { RecordId, WatcherListItemDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { problemMessage } from '@/shared/http/problemMessage';
import { useMe } from '@/features/users/useMe';

import { useRecordWatchers, useWatchToggle } from './useWatchers';
import './watchers.css';

/** The firm-default notification rules watchers receive (static reference — matches the prototype). */
const NOTIFY_RULES: { key: string; label: string; description: string }[] = [
  { key: 'gates', label: 'Gate decisions', description: 'Approvals and change requests on any gate' },
  { key: 'status', label: 'Status changes', description: 'On hold, abandoned, or reactivated' },
  { key: 'signoffs', label: 'Task sign-offs', description: 'When a sign-off task is approved or rejected' },
  { key: 'sla', label: 'SLA & due-date reminders', description: 'Approaching or past the due date' },
  { key: 'mentions', label: 'Mentions', description: "When you're @mentioned in a comment" },
];

/** Up to two initials from a display name — e.g. "Priya Raman" → "PR". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
}

function WatcherAvatar({ watcher }: { watcher: WatcherListItemDto }) {
  return (
    <li className="watchers__row">
      <span className="watchers__avatar" aria-hidden>
        {initials(watcher.displayName)}
      </span>
      <span className="watchers__name">{watcher.displayName}</span>
    </li>
  );
}

export function WatchersCard({ recordId }: { recordId: RecordId }) {
  const { data, isLoading, isError, error } = useRecordWatchers(recordId);
  const { data: me } = useMe();
  const toggle = useWatchToggle(recordId);

  const isWatching = data?.isWatching ?? false;
  const watchers = data?.watchers ?? [];

  const onToggle = () => {
    if (!me) return;
    toggle.mutate({ watch: !isWatching, userId: me.user.id });
  };

  return (
    <div className="watchers">
      <section className="record-card" aria-label="Watchers">
        <span className="record-chip">
          <Eye size={15} aria-hidden />
          Watchers
        </span>

        {isLoading && (
          <p className="caption" role="status">
            Loading watchers…
          </p>
        )}

        {isError && (
          <p className="mws-alert mws-alert--warning" role="status">
            {problemMessage(error, 'Watchers couldn’t be loaded. Try again in a moment.')}
          </p>
        )}

        {!isLoading && !isError && (
          <>
            {watchers.length > 0 ? (
              <ul className="watchers__list">
                {watchers.map((watcher) => (
                  <WatcherAvatar key={watcher.userId} watcher={watcher} />
                ))}
              </ul>
            ) : (
              <p className="caption">No one is watching this record yet.</p>
            )}

            <div className="watchers__actions">
              <Button
                variant="secondary"
                compact
                onClick={onToggle}
                disabled={toggle.isPending || !me}
                aria-pressed={isWatching}
              >
                {isWatching ? <EyeSlash size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                {isWatching ? 'Watching' : 'Watch this record'}
              </Button>
            </div>

            {toggle.isError && (
              <p className="mws-alert mws-alert--warning" role="status">
                {problemMessage(toggle.error, 'Your subscription couldn’t be updated. Try again in a moment.')}
              </p>
            )}
          </>
        )}
      </section>

      <section className="record-card" aria-label="Notify watchers about">
        <span className="record-chip">
          <Bell size={15} aria-hidden />
          Notify watchers about
        </span>
        <ul className="watchers__rules">
          {NOTIFY_RULES.map((rule) => (
            <li key={rule.key} className="watchers__rule">
              <span className="watchers__rule-label">{rule.label}</span>
              <span className="watchers__rule-desc">{rule.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
