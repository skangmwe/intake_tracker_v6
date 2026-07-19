// Watchers card — the S4/S5 Watchers & alerts tab (BS §17.3, §11.2). Three cards, per the prototype:
// (1) Watchers — the live roster (avatar initials + name) with a Watch / Watching self-toggle;
// (2) Active alerts — what currently needs attention on the record (overdue dates, blocked gates,
//     pending approvals, holds); empty-state today;
// (3) Notify watchers about — Slice 26: five per-record preference toggles (Gate decisions · Status
// changes · Task sign-offs · SLA & due-date reminders · Mentions & comments) that suppress bell
// notifications per-category server-side. The toggles are ALWAYS visible (prototype reconciliation) —
// the caller's own preferences come back on `myPreferences` independent of watch state. Renders
// explicit loading / error / empty states (web-component-architecture.md). All preference state is
// per-caller-per-record; watchers never see other watchers' preferences.

import { Bell, Eye, EyeSlash, Warning } from '@phosphor-icons/react';

import type {
  RecordId,
  WatcherListItemDto,
  WatcherPreferencesPatchRequest,
} from '@shared/types';

import { Button } from '@/shared/components/Button';
import { problemMessage } from '@/shared/http/problemMessage';
import { useMe } from '@/features/users/useMe';

import { usePatchMyWatch, useRecordWatchers, useWatchToggle } from './useWatchers';
import './watchers.css';

/** The five per-record notification categories (v2-reconciliation.md §Model deltas 6). */
type PreferenceKey =
  | 'notifyGateDecisions'
  | 'notifyStatusChanges'
  | 'notifyTaskSignoffs'
  | 'notifySlaAndDueDateReminders'
  | 'notifyMentionsAndComments';

const PREFERENCE_ROWS: {
  key: PreferenceKey;
  label: string;
  description: string;
}[] = [
  { key: 'notifyGateDecisions',          label: 'Gate decisions',            description: 'Approvals and change requests on any gate' },
  { key: 'notifyStatusChanges',          label: 'Status changes',            description: 'In progress, on hold, abandoned, or reactivated' },
  { key: 'notifyTaskSignoffs',           label: 'Task sign-offs',            description: 'When a sign-off task is approved or rejected' },
  { key: 'notifySlaAndDueDateReminders', label: 'SLA & due-date reminders',  description: 'Approaching or past the due date' },
  { key: 'notifyMentionsAndComments',    label: 'Mentions & comments',       description: "When you're @mentioned in a comment" },
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

interface PreferenceToggleRowProps {
  row: (typeof PREFERENCE_ROWS)[number];
  /** Current effective value (undefined defaults to true — opt-out model). */
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

function PreferenceToggleRow({ row, value, onChange, disabled }: PreferenceToggleRowProps) {
  return (
    <li className="watchers__rule">
      <label className="watchers__pref">
        <input
          type="checkbox"
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          aria-describedby={`watch-pref-desc-${row.key}`}
        />
        <span className="watchers__rule-label">{row.label}</span>
      </label>
      <span id={`watch-pref-desc-${row.key}`} className="watchers__rule-desc">
        {row.description}
      </span>
    </li>
  );
}

export function WatchersCard({ recordId }: { recordId: RecordId }) {
  const { data, isLoading, isError, error } = useRecordWatchers(recordId);
  const { data: me } = useMe();
  const toggle = useWatchToggle(recordId);
  const patchMine = usePatchMyWatch(recordId);

  const isWatching = data?.isWatching ?? false;
  const watchers = data?.watchers ?? [];
  const myPreferences = data?.myPreferences;

  const readPreference = (key: PreferenceKey): boolean => {
    // The caller's own effective preference — always present on the response, independent of watch
    // state (undefined only during the initial load → default to true, the opt-out model).
    return myPreferences?.[key] ?? true;
  };

  const commitPreference = (key: PreferenceKey, next: boolean) => {
    const patch: WatcherPreferencesPatchRequest = { [key]: next };
    patchMine.mutate(patch);
  };

  const onToggleWatch = () => {
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
                onClick={onToggleWatch}
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

      <section className="record-card" aria-label="Active alerts">
        <span className="record-chip">
          <Warning size={15} aria-hidden />
          Active alerts
        </span>
        <p className="caption">
          Nothing needs attention right now. Overdue dates, blocked gates, pending approvals, and
          holds will surface here.
        </p>
      </section>

      <section className="record-card" aria-label="Notify watchers about">
        <span className="record-chip">
          <Bell size={15} aria-hidden />
          Notify watchers about
        </span>
        <p className="caption">
          Choose which categories send a bell notification on this record. Preferences are
          per-record — they don’t change your alerts on other records.
        </p>
        <ul className="watchers__rules">
          {PREFERENCE_ROWS.map((row) => (
            <PreferenceToggleRow
              key={row.key}
              row={row}
              value={readPreference(row.key)}
              onChange={(next) => commitPreference(row.key, next)}
              disabled={patchMine.isPending || isLoading || isError}
            />
          ))}
        </ul>
        {patchMine.isError && (
          <p className="mws-alert mws-alert--warning" role="status">
            {problemMessage(patchMine.error, 'Your preferences couldn’t be saved. Try again in a moment.')}
          </p>
        )}
      </section>
    </div>
  );
}

