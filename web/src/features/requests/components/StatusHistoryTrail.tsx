// S4 Status-tab "Status history & reactivation trail" (record-detail reconciliation). Sources the
// record's on-hold / abandoned / reactivation events from the existing activity thread (audit events
// of type `request.status-hold-changed`) — no new backend. The audit summary carries the change; a
// per-event reason is not structured on the thread yet, so only the summary + timestamp render.

import { ClockCounterClockwise } from '@phosphor-icons/react';

import type { ActivityThreadItem, RecordId } from '@shared/types';

import { useThread } from '@/features/comments';

import { formatSubmitted } from '../statusPresentation';

const STATUS_HOLD_EVENT = 'request.status-hold-changed';

type EventItem = Extract<ActivityThreadItem, { kind: 'event' }>;

export function StatusHistoryTrail({ recordId }: { recordId: RecordId }) {
  const { data, isLoading, isError } = useThread(recordId);

  const events = (data ?? []).filter(
    (item): item is EventItem => item.kind === 'event' && item.event.eventType === STATUS_HOLD_EVENT,
  );

  return (
    <section className="record-card" aria-label="Status history and reactivation trail">
      <span className="record-chip">
        <ClockCounterClockwise size={15} aria-hidden />
        Status history &amp; reactivation trail
      </span>

      {isLoading && (
        <p className="caption" role="status">
          Loading status history…
        </p>
      )}

      {isError && <p className="caption">Status history couldn’t be loaded. Try again in a moment.</p>}

      {!isLoading && !isError && events.length === 0 && (
        <p className="caption">
          No status changes yet. On-hold, abandonment, and reactivation events will appear here.
        </p>
      )}

      {events.length > 0 && (
        <ul className="record-trail">
          {events.map((item, index) => (
            <li className="record-trail__item" key={`${item.event.eventAt}-${index}`}>
              <span className="record-trail__icon" aria-hidden>
                <ClockCounterClockwise size={20} />
              </span>
              <span className="record-trail__body">
                <span className="record-trail__title">{item.event.summary}</span>
                <span className="record-trail__meta">{formatSubmitted(item.event.eventAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
