// Pure helpers for the S32 shared-dashboards management panel — building/reading the audience shape and
// its human labels. Kept side-effect-free and unit-tested (web-file-structure.md). Named-users editing
// has no user picker in R1 (no personal dashboards), so its userIds pass through unchanged.

import type { AnnouncementAudience, AnnouncementAudienceKind, UserId } from '@shared/types';

export const AUDIENCE_KIND_LABEL: Record<AnnouncementAudienceKind, string> = {
  everyone: 'Everyone',
  'role-scoped': 'Role-scoped',
  'named-users': 'Named users',
};

/** Comma/newline-separated role labels → a trimmed, de-duplicated, non-empty list. */
export function parseRoleLabels(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[,\n]/)) {
    const trimmed = raw.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

/** The current audience's role labels as a comma-separated string for the edit field. */
export function roleLabelsToText(audience: AnnouncementAudience): string {
  return (audience.roleLabels ?? []).join(', ');
}

/** Build the audience to PATCH from the dialog state. Preserves existing named userIds. */
export function buildAudience(
  kind: AnnouncementAudienceKind,
  roleLabelsText: string,
  existing: AnnouncementAudience,
): AnnouncementAudience {
  if (kind === 'role-scoped') {
    return { kind, roleLabels: parseRoleLabels(roleLabelsText) };
  }
  if (kind === 'named-users') {
    return { kind, userIds: (existing.userIds ?? []) as UserId[] };
  }
  return { kind: 'everyone' };
}

/** A short one-line summary of an audience for the management table. */
export function summarizeAudience(audience: AnnouncementAudience): string {
  if (audience.kind === 'role-scoped') {
    const labels = audience.roleLabels ?? [];
    return labels.length > 0 ? `Role-scoped · ${labels.join(', ')}` : 'Role-scoped';
  }
  if (audience.kind === 'named-users') {
    const count = audience.userIds?.length ?? 0;
    return `Named users · ${count} ${count === 1 ? 'person' : 'people'}`;
  }
  return 'Everyone';
}
