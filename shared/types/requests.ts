// Request — the primary record. Full field schema in BS §17; the shape below carries
// the fields the API surfaces, not the DB columns.

import type {
  IsoDate,
  IsoDateTime,
  LifecycleId,
  RecordId,
  UserId,
  WorkspaceId,
} from './common';

/** One stage on a record's lifecycle — the ordered set drives the record-detail stepper (S4). */
export interface RequestStageRef {
  key: string;
  label: string;
}

/** AI Solutions delivery Outcome (BS §8) — the AI-side terminal states. */
export type DeliveryOutcome = 'Live' | 'Declined' | 'Withdrawn' | 'Duplicate';

/**
 * PG-local Outcome — the template-local Outcome used when a Practice Group closes
 * a request locally without escalating (BS §1.1).
 */
export type LocalOutcome = 'Withdrawn' | 'Duplicate' | 'NotPursued';

/**
 * The combined Outcome union sent over the wire. The `kind` disambiguates.
 * `Live` renders as `Live` (delivered) — Display Status derives this.
 */
export interface Outcome {
  kind: 'delivery' | 'local';
  value: DeliveryOutcome | LocalOutcome;
  notes: string;
  duplicateOfRecordId?: RecordId;
}

/** SLA status — derived from Due Date vs the workspace's due-soon window (BS §17.2). */
export type SlaStatus = 'OnTrack' | 'DueSoon' | 'Overdue';

/** Time spent in the record's current stage (BS §10.6) — whole days since the stage was entered. */
export interface TimeInStage {
  /** The stage the record is currently in (matches `RequestDto.stage`). */
  stageKey: string;
  /** Whole days elapsed since the current stage began. */
  days: number;
}

/**
 * The Request DTO returned by GET /requests/{id}. Carries content fields as an
 * open map (fields are workspace-configurable via S30), plus fixed system and
 * lifecycle fields.
 */
export interface RequestDto {
  id: RecordId;
  workspaceId: WorkspaceId;
  /** The originating workspace's name — resolved via the platform prefix registry. */
  origin: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  createdBy: UserId;
  updatedBy: UserId;
  /**
   * The record's `Legacy ID` — populated only by CSV import (BS §3.6). Searchable,
   * not unique-constrained, not a crossing field.
   */
  legacyId?: string;

  // Lifecycle
  /** The lifecycle this record runs on (chosen at intake by request type, else the default). */
  lifecycleId: LifecycleId;
  /** The record's lifecycle's ordered stages — drives the S4 stepper without a second fetch. */
  stages: RequestStageRef[];
  /** Current stage key (matches one of `stages[].key`). */
  stage?: string;
  hold?: { held: boolean; reason?: string };
  outcome?: Outcome;
  displayStatus: string;
  slaStatus?: SlaStatus;
  /** Time in the current stage (BS §10.6) — omitted when the stage-entry time is unknown. */
  timeInStage?: TimeInStage;

  // Values
  name: string;
  description: string;
  /** Every content field flows through this map — keys are the field's stable `fieldKey` (BS §17). */
  fields: Record<string, unknown>;

  // Bridge — present only on escalated records.
  bridge?: BridgeBlock;

  // For optimistic concurrency on PATCH.
  eTag: string;
}

/** Escalation state summary for an escalated record. */
export interface BridgeBlock {
  isEscalated: true;
  originWorkspaceId: WorkspaceId;
  originWorkspaceName: string;
  aiWorkspaceId: WorkspaceId;
  escalatedAt: IsoDateTime;
  /**
   * The AI Solutions Status field value. Read-only for everyone (BS §6.4);
   * written only by the bridge off the event spine.
   */
  aiSolutionsStatus: string;
  /**
   * The field *keys* frozen on the PG side at escalation — the crossing snapshot keys. The Intake
   * tab renders the "⇄ Crossed · locked on PG" marker on each field whose `fieldKey` is in this set.
   * (Keys, not definition ids: the marker is matched against the intake form's `fieldKey`.)
   */
  lockedFields: string[];
}

/** POST /workspaces/{id}/requests. */
export interface RequestCreateRequest {
  name: string;
  description: string;
  fields: Record<string, unknown>;
  /**
   * Typed links queued on the draft during the similar-requests nudge (BS §9.8).
   * Stamped as `related` links at submission (slice 10).
   */
  queuedRelatedRecordIds?: RecordId[];
  /**
   * Kinded link-backs queued on the draft by Copy / Promote (BS §5). Each is stamped as a typed
   * link from the newly-minted record to `toRecordId` at submission (slice 10).
   */
  queuedLinks?: import('./collaboration').QueuedLink[];
}

/** PATCH /requests/{id}. Sparse — send only fields that changed. */
export interface RequestPatchRequest {
  name?: string;
  description?: string;
  fields?: Record<string, unknown>;
  hold?: { held: boolean; reason?: string };
  /**
   * ETag from the last-loaded record. Server returns 409 stale-record if it
   * doesn't match; the client refetches and reapplies (`web-state-management.md`).
   */
  ifMatch: string;
}

/** POST /requests/{id}/stage. */
export interface StageTransitionRequest {
  toStage: string;
}

export type StageTransitionResult =
  | { advanced: true; newStage: string }
  | { advanced: false; gateOpened: import('./gates').ApprovalRequestDto };

/** POST /requests/{id}/escalate. */
export interface EscalateRequest {
  /** Must be true when any crossing field has uncommitted edits. */
  confirmPendingEdits: boolean;
}

export interface EscalateResult {
  recordId: RecordId;
  aiWorkspaceId: WorkspaceId;
  /**
   * The AI-side record — present only when the escalator is also a member of the AI Solutions
   * workspace. A PG-only escalator (the common case) cannot see the AI record (BS §6.4), so this is
   * null and the PG UI refetches the now-escalated PG record to render the bridge.
   */
  aiRecord: RequestDto | null;
}

/** POST /requests/{id}/close. */
export interface RequestCloseRequest {
  outcome: Outcome;
}

/**
 * A single similar-requests match surfaced by the intake nudge (BS §9.8) —
 * GET /workspaces/{id}/requests/similar. Access-respecting and workspace-scoped;
 * a match never crosses a workspace boundary (BS §9.5).
 */
export interface SimilarRequestDto {
  id: RecordId;
  name: string;
  /** Current stage label (or key when no label resolves) — shown next to the id. */
  stage: string;
  /** The originating workspace name, resolved via the prefix registry. */
  origin: string;
}

/** A single row on the Requests list. Columns are the caller's saved view (S24). */
export interface RequestListRow {
  id: RecordId;
  eTag: string;
  /** The saved view's columns, projected. Boundary-enforced (BS §22.4). */
  columns: Record<string, unknown>;
  /** SLA state — drives aging tint on rows. */
  slaStatus?: SlaStatus;
}
