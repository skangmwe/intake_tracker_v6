// Maps an announcement status to the shared StatusPill (pale fill + navy text, label always paired
// with colour — notifications-and-feedback.md).

import { StatusPill } from '@/shared/components/Feedback';
import type { AnnouncementStatus } from '@shared/types';

import { STATUS_PILL } from '../constants';

interface AnnouncementStatusBadgeProps {
  status: AnnouncementStatus;
}

export function AnnouncementStatusBadge({ status }: AnnouncementStatusBadgeProps) {
  const pill = STATUS_PILL[status];
  return <StatusPill status={pill.kind} label={pill.label} />;
}
