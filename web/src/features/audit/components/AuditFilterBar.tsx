// S33 audit filter bar — date range, actor, record, and event type (BS §12). A small form with its
// own draft state: the admin sets filters and clicks Apply (avoids a query per keystroke on the
// record field), or Clear to reset. Discrete controls (dates, selects) and the record text all ride
// one submit. Presentational — actor options are supplied by the page (from the workspace member
// list) so this component stays testable without mocking a data hook. forms-and-input.md controls.

import { useEffect, useState, type FormEvent } from 'react';

import type { AuditLogQuery, EventType, RecordId, UserId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { DateField, Select, TextField, type SelectOption } from '@/shared/components/Form';

import { EVENT_TYPE_OPTIONS } from '../constants';

/** The applied filter set (the query fields the bar owns — paging lives on the page). */
export interface AuditFilterValues {
  dateFrom: string;
  dateTo: string;
  actorUserId: string;
  recordId: string;
  eventType: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilterValues = {
  dateFrom: '',
  dateTo: '',
  actorUserId: '',
  recordId: '',
  eventType: '',
};

/** Fold the bar's string values into the wire query shape — an empty string drops the filter. */
export function toAuditQuery(values: AuditFilterValues): Omit<AuditLogQuery, 'page' | 'pageSize'> {
  return {
    ...(values.dateFrom ? { dateFrom: values.dateFrom } : {}),
    ...(values.dateTo ? { dateTo: values.dateTo } : {}),
    ...(values.actorUserId ? { actorUserId: values.actorUserId as UserId } : {}),
    ...(values.recordId.trim() ? { recordId: values.recordId.trim() as RecordId } : {}),
    ...(values.eventType ? { eventType: values.eventType as EventType } : {}),
  };
}

const ALL_ACTORS: SelectOption = { value: '', label: 'All actors' };
const ALL_EVENTS: SelectOption = { value: '', label: 'All event types' };

const EVENT_OPTIONS: SelectOption[] = [ALL_EVENTS, ...EVENT_TYPE_OPTIONS.map((option) => ({ ...option }))];

interface AuditFilterBarProps {
  /** The currently-applied filters (drives the draft when it changes, e.g. after Clear). */
  value: AuditFilterValues;
  /** Actor choices — the workspace's members, prepended with "All actors". */
  actorOptions: SelectOption[];
  onApply: (values: AuditFilterValues) => void;
  onClear: () => void;
}

export function AuditFilterBar({ value, actorOptions, onApply, onClear }: AuditFilterBarProps) {
  const [draft, setDraft] = useState<AuditFilterValues>(value);

  // Keep the draft in step with externally-applied changes (e.g. Clear resets `value`).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const set = (patch: Partial<AuditFilterValues>) => setDraft((current) => ({ ...current, ...patch }));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply(draft);
  };

  const actorSelectOptions: SelectOption[] = [ALL_ACTORS, ...actorOptions];

  return (
    <form className="audit-filters" aria-label="Filter the audit log" onSubmit={onSubmit}>
      <div className="audit-filters__grid">
        <DateField
          label="From"
          optional
          value={draft.dateFrom}
          max={draft.dateTo || undefined}
          onChange={(next) => set({ dateFrom: next })}
        />
        <DateField
          label="To"
          optional
          value={draft.dateTo}
          min={draft.dateFrom || undefined}
          onChange={(next) => set({ dateTo: next })}
        />
        <Select
          label="Actor"
          optional
          value={draft.actorUserId}
          options={actorSelectOptions}
          onChange={(next) => set({ actorUserId: next })}
        />
        <Select
          label="Event type"
          optional
          value={draft.eventType}
          options={EVENT_OPTIONS}
          onChange={(next) => set({ eventType: next })}
        />
        <TextField
          label="Record ID"
          optional
          value={draft.recordId}
          placeholder="e.g. AIS-00000042"
          onChange={(next) => set({ recordId: next })}
        />
      </div>
      <div className="audit-filters__actions">
        <Button variant="secondary" type="submit">
          Apply filters
        </Button>
        <Button variant="secondary" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    </form>
  );
}
