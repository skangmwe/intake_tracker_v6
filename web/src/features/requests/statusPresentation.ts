// Pure presentation helpers for the S4 Status tab (record-detail reconciliation). SLA descriptor,
// status-category derivation, and the submitted-date formatter — no React, no I/O
// (web-file-structure.md). Unit-tested directly in statusPresentation.test.ts.

import type { SlaStatus } from '@shared/types';

import { formatDate } from '@/shared/utils/dateFormat';

/** `5 Jul 2026` long-form submitted/eventtimestamp; em-dash when unparseable. */
export function formatSubmitted(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : formatDate(date);
}

export type SlaTone = 'error' | 'warning' | 'success' | 'muted';
export type SlaIconKey = 'overdue' | 'dueSoon' | 'onTrack' | 'none';

/** How the S4 SLA block renders one SLA state — an icon key + tone + label + supporting detail. */
export interface SlaPresentation {
  tone: SlaTone;
  iconKey: SlaIconKey;
  label: string;
  detail: string;
}

/**
 * Map the API-derived SLA status (BS §17.2) to its Status-tab presentation. `undefined` (no due
 * date) yields the muted "No due date" state — the prototype always renders the SLA block.
 */
export function slaPresentation(slaStatus?: SlaStatus): SlaPresentation {
  switch (slaStatus) {
    case 'Overdue':
      return { tone: 'error', iconKey: 'overdue', label: 'Overdue', detail: 'Past the due date.' };
    case 'DueSoon':
      return {
        tone: 'warning',
        iconKey: 'dueSoon',
        label: 'Due soon',
        detail: 'Approaching the due date.',
      };
    case 'OnTrack':
      return {
        tone: 'success',
        iconKey: 'onTrack',
        label: 'On track',
        detail: 'Within the due-date window.',
      };
    default:
      return {
        tone: 'muted',
        iconKey: 'none',
        label: 'No due date',
        detail: 'Set a due date to track SLA.',
      };
  }
}
