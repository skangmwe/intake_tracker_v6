// Pure presentation helpers for the Home panels (no I/O — unit-tested without a DOM). Formatting is
// locale-aware where it renders a date; relative phrasing is deliberately coarse ("2 hrs ago",
// "Yesterday") to match the prototype.

import type { ComponentType } from 'react';
import {
  Archive,
  ArrowBendUpRight,
  ChatCircle,
  ClockCounterClockwise,
  FileText,
  Gear,
  Megaphone,
  Paperclip,
  SealCheck,
  Sparkle,
  type IconProps,
} from '@phosphor-icons/react';

// Import the pure event-label helpers from the audit feature's leaf constants module, NOT its barrel:
// the barrel eagerly re-exports WorkspaceAuditPage (a full page pulling useMe/useMembers/tables), so
// importing it here would drag that whole tree into the Home graph (and its module-load order breaks
// rendering under test). These are stateless functions — the leaf import is the right dependency.
import { eventGroup, eventTypeLabel } from '@/features/audit/constants';

type IconComponent = ComponentType<IconProps>;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** Coarse "time ago" for the activity panel — minutes → hours → Yesterday → days → a date. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const deltaMs = now.getTime() - then.getTime();
  if (Number.isNaN(deltaMs)) return '';
  if (deltaMs < MS_PER_MINUTE) return 'Just now';
  if (deltaMs < MS_PER_HOUR) {
    const minutes = Math.floor(deltaMs / MS_PER_MINUTE);
    return `${minutes} min ago`;
  }
  if (deltaMs < MS_PER_DAY) {
    const hours = Math.floor(deltaMs / MS_PER_HOUR);
    return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(deltaMs / MS_PER_DAY);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** "Waiting 2 days" / "Waiting 5 hours" for an open gate, from when it opened. */
export function formatWaiting(openedAtIso: string, now: Date = new Date()): string {
  const opened = new Date(openedAtIso);
  const deltaMs = now.getTime() - opened.getTime();
  if (Number.isNaN(deltaMs) || deltaMs < 0) return 'Waiting';
  if (deltaMs < MS_PER_HOUR) {
    const minutes = Math.max(1, Math.floor(deltaMs / MS_PER_MINUTE));
    return `Waiting ${minutes} min`;
  }
  if (deltaMs < MS_PER_DAY) {
    const hours = Math.floor(deltaMs / MS_PER_HOUR);
    return `Waiting ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.floor(deltaMs / MS_PER_DAY);
  return `Waiting ${days} day${days === 1 ? '' : 's'}`;
}

/** The "Since you were last here" header value — a date, or a gentle fallback on the first visit. */
export function formatSince(iso: string | null): string {
  if (!iso) return 'your last visit';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'your last visit';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The due-badge tint class for a work item, from its SLA state. Null → no badge (plain due text). */
export function dueBadgeClass(slaStatus: string | null): string | null {
  switch (slaStatus) {
    case 'Overdue':
      return 'home-badge home-badge--overdue';
    case 'DueSoon':
      return 'home-badge home-badge--due-soon';
    default:
      return null;
  }
}

/** Human due label for a work item — "Overdue", "Due today", "Due 6 Jul", or "No due date". */
export function formatDue(dueDate: string | null, slaStatus: string | null, now: Date = new Date()): string {
  if (!dueDate) return 'No due date';
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return 'No due date';
  if (slaStatus === 'Overdue') return 'Overdue';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueDay.getTime() === today.getTime()) return 'Due today';
  return `Due ${due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/** The icon + plain-language label for an activity row, from its audit event type (reuses the audit map). */
export function activityPresentation(eventType: string): { Icon: IconComponent; label: string } {
  const label = eventTypeLabel(eventType);
  switch (eventGroup(eventType)) {
    case 'gate':
      return { Icon: SealCheck, label };
    case 'escalation':
      return { Icon: ArrowBendUpRight, label };
    case 'catalog':
      return { Icon: Sparkle, label };
    case 'announcement':
      return { Icon: Megaphone, label };
    case 'comment':
      return { Icon: ChatCircle, label };
    case 'attachment':
      return { Icon: Paperclip, label };
    case 'config':
      return { Icon: Gear, label };
    case 'record':
      return eventType === 'request.closed'
        ? { Icon: Archive, label }
        : { Icon: FileText, label };
    default:
      return { Icon: ClockCounterClockwise, label };
  }
}
