// S39 firm-wide audit filter bar — date range, record, and event type. Its own draft state: the admin
// sets filters and clicks Apply (avoids a query per keystroke on the record field), or Clear. There is
// no actor filter: R1 has no firm-wide user directory to populate an actor picker (the workspace audit
// bar sources actors from the workspace member list — no such single list firm-wide). Presentational.

import { useEffect, useState, type FormEvent } from 'react';

import type { EventType, FirmWideAuditQuery, RecordId } from '@shared/types';

import { EVENT_TYPE_OPTIONS } from '@/features/audit';
import { Button } from '@/shared/components/Button';
import { DateField, Select, TextField, type SelectOption } from '@/shared/components/Form';

/** The applied filter set (the query fields the bar owns — paging lives on the page). */
export interface FirmAuditFilterValues {
  dateFrom: string;
  dateTo: string;
  recordId: string;
  eventType: string;
}

export const EMPTY_FIRM_AUDIT_FILTERS: FirmAuditFilterValues = {
  dateFrom: '',
  dateTo: '',
  recordId: '',
  eventType: '',
};

/** Fold the bar's string values into the wire query shape — an empty string drops the filter. */
export function toFirmAuditQuery(values: FirmAuditFilterValues): Omit<FirmWideAuditQuery, 'page' | 'pageSize'> {
  return {
    ...(values.dateFrom ? { dateFrom: values.dateFrom } : {}),
    ...(values.dateTo ? { dateTo: values.dateTo } : {}),
    ...(values.recordId.trim() ? { recordId: values.recordId.trim() as RecordId } : {}),
    ...(values.eventType ? { eventType: values.eventType as EventType } : {}),
  };
}

const ALL_EVENTS: SelectOption = { value: '', label: 'All event types' };
const EVENT_OPTIONS: SelectOption[] = [ALL_EVENTS, ...EVENT_TYPE_OPTIONS.map((option) => ({ ...option }))];

interface FirmAuditFilterBarProps {
  value: FirmAuditFilterValues;
  onApply: (values: FirmAuditFilterValues) => void;
  onClear: () => void;
}

export function FirmAuditFilterBar({ value, onApply, onClear }: FirmAuditFilterBarProps) {
  const [draft, setDraft] = useState<FirmAuditFilterValues>(value);

  // Keep the draft in step with externally-applied changes (e.g. Clear resets `value`).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const set = (patch: Partial<FirmAuditFilterValues>) => setDraft((current) => ({ ...current, ...patch }));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply(draft);
  };

  return (
    <form className="platform-filters" aria-label="Filter the firm-wide audit log" onSubmit={onSubmit}>
      <div className="platform-filters__grid">
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
      <div className="platform-filters__actions">
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
