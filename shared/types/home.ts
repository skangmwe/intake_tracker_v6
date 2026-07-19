// Home surface (S1) — the per-user landing composite (BS §10.7). One GET /api/v1/home?workspaceId=
// call returns a HomeDto: five viewer-scoped panels assembled server-side. Scoped to the active
// workspace (the panels are workspace-specific and the app resolves an active workspace everywhere).
// Slice 22.

import type { RequestStatusHold, SlaStatus } from './requests';

/** "Needs your decision" — an open gate where the caller is an eligible, not-yet-signed slot member. */
export interface HomeDecisionItem {
  recordId: string;
  name: string;
  /** The gate's frozen transition label, e.g. "Build → QA". */
  gateLabel: string;
  /** The role label of the caller's eligible slot, e.g. "AI Solutions Manager". */
  roleLabel: string;
  /** When the gate opened — the client renders "Waiting N days/hours". ISO 8601 UTC. */
  openedAt: string;
  /** v2 (slice 26). The record's Status/hold. Drives the StatusHoldPill on the card. Optional so
   * the API can add the projection incrementally without a wire break. */
  statusHold?: RequestStatusHold;
}

/** "Your work today" — a record the caller owns (created), urgency-ordered. */
export interface HomeWorkItem {
  recordId: string;
  name: string;
  /** Current stage label (falls back to the stage key when no lifecycle label resolves). */
  stageLabel: string;
  /** Origin workspace / dept name. */
  origin: string;
  /** Due date (ISO date, no time) or null. */
  dueDate: string | null;
  /** SLA state driving the due-badge tint; null when there is no due date. */
  slaStatus: SlaStatus | null;
  /** v2 (slice 26). The record's Status/hold. Optional so the API can add the projection incrementally. */
  statusHold?: RequestStatusHold;
}

/** "Since you were last here" — an audit event on a visible record since the caller's prior Home visit. */
export interface HomeActivityItem {
  recordId: string | null;
  name: string;
  /** The audit EventType — the client maps it to an icon + verb phrase. */
  eventType: string;
  /** Actor display name, or null for system-generated events. */
  actorName: string | null;
  /** When the event occurred. ISO 8601 UTC. */
  eventAt: string;
}

/** "New to triage" — an unassigned record awaiting an analyst. */
export interface HomeTriageItem {
  recordId: string;
  name: string;
  /** Origin workspace / dept name (e.g. "Escalated · Tax", "Direct intake"). */
  origin: string;
  /** When the record was created / received. ISO 8601 UTC. */
  receivedAt: string;
  /** v2 (slice 26). The record's Status/hold. Optional so the API can add the projection incrementally. */
  statusHold?: RequestStatusHold;
}

/** A pinned, published announcement surfaced in the Home slim strip. */
export interface HomePinnedAnnouncement {
  announcementId: string;
  title: string;
  bodySnippet: string;
  publishedAt: string | null;
}

/** The composite Home payload (BS §10.7). Every panel is capped server-side; counts are the full match. */
export interface HomeDto {
  workspaceId: string;
  decisions: HomeDecisionItem[];
  decisionCount: number;
  work: HomeWorkItem[];
  workCount: number;
  activity: HomeActivityItem[];
  /** The anchor for the "Since ..." header — the caller's previous Home visit, or null on first visit. */
  sinceLastSeenAt: string | null;
  triage: HomeTriageItem[];
  triageCount: number;
  pinnedAnnouncements: HomePinnedAnnouncement[];
}
