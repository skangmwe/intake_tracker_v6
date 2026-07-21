// Gates and Approvals — the sign-off machinery.

import type {
  ApprovalRequestId,
  GateDefinitionId,
  IsoDateTime,
  LifecycleId,
  RecordId,
  StageDefinitionId,
  UserId,
  WorkspaceId,
} from './common';

/** ApprovalRequest state — the gate as a whole, not per-slot. */
export type ApprovalRequestState = 'Pending' | 'ChangesRequested' | 'Resolved';

/** Per-slot decision. */
export type SlotDecision = 'Pending' | 'Approved' | 'Rejected';

/**
 * Frozen approver-slot snapshot — the team the slot targets (identified by role label)
 * plus the eligible members at gate-open. Per prototype changelog:
 *   "gate approver slots now identify only the team/role label"
 * The eligible members (userId + displayName) are frozen so the "Select your name" dropdown
 * renders names without a live user-directory lookup (the directory lands in slice 12). The
 * actual signer is captured on decision.
 */
export interface FrozenApproverSlot {
  slotIndex: number;
  roleLabel: string;
  /** The members eligible to sign this slot at freeze time (snapshot — BS §7.2). */
  eligibleMembers: ApproverTeamMemberDto[];
  /** Human-readable label — copied at freeze. */
  displayLabel: string;
}

/**
 * One decision on a slot. Slots keep an append-only history: a superseded rejection stays
 * visible as "Rejected · signer · time" while the live decision (superseded = false) drives
 * the slot's current state.
 */
export interface ApprovalDecisionDto {
  slotIndex: number;
  decision: 'Approved' | 'Rejected';
  decidedByUserId?: UserId;
  /** The signer's display name — carried on the decision for the rejection/approval line. */
  decidedByName?: string;
  decidedAt?: IsoDateTime;
  comment?: string;
  isProxy: boolean;
  /** True once a later decision (or a re-request) replaced this one; retained as history. */
  superseded: boolean;
}

/** A gate in flight — one ApprovalRequest per gate firing. */
export interface ApprovalRequestDto {
  id: ApprovalRequestId;
  requestRecordId: RecordId;
  gateDefinitionId: GateDefinitionId;
  gateName: string;
  fromStage: string;
  toStage: string;
  state: ApprovalRequestState;
  openedAt: IsoDateTime;
  resolvedAt?: IsoDateTime;
  slots: FrozenApproverSlot[];
  /** Current decision per slot (latest attempt for each). */
  decisions: ApprovalDecisionDto[];
}

/** POST /approval-requests/{id}/decisions. */
export interface ApprovalDecisionRequest {
  slotIndex: number;
  /** The name the acting team member picked from the "Select your name" dropdown. Must be in the frozen slot's eligible set AND currently a member. */
  decidedByUserId: UserId;
  decision: 'Approved' | 'Rejected';
  /** Required when Rejected. Server returns 400 rejection-requires-comment if omitted. */
  comment?: string;
}

/** POST /approval-requests/{id}/re-request. */
export interface ReRequestApprovalRequest {
  slotIndex: number;
}

/** POST /approval-requests/{id}/proxy-decision — Workspace admin only. */
export interface ProxyApprovalDecisionRequest extends ApprovalDecisionRequest {
  proxyContext: string;
}

/** Gate configuration (S31 Lifecycle & gates). */
export interface GateDefinitionDto {
  id: GateDefinitionId;
  /** The lifecycle this gate belongs to. */
  lifecycleId: LifecycleId;
  name: string;
  fromStageId: StageDefinitionId;
  toStageId: StageDefinitionId;
  slots: Array<{
    roleLabel: string;
    /** N eligible (a count, not a user list — computed live from the ApproverTeamMembership table). */
    eligibleCount: number;
  }>;
  /** AND-join is the only join type — every slot must approve. */
  joinKind: 'and';
}

// ─── S31 Lifecycle & gates admin — the workspace config surface ───────────────
// The prototype (authoritative) models many per-request-type Lifecycles per workspace,
// each with its own ordered stages and gates, plus a per-workspace Approver-teams roster.

/** Dashboard/rollup bucket a stage maps to (§10.6). One per stage (1:1 with the lifecycle). */
export type StatusCategory =
  | 'Intake'
  | 'Triage'
  | 'Execution'
  | 'Validation'
  | 'Delivery'
  | 'Stabilization'
  | 'Closeout';

/** One stage on a lifecycle's track. */
export interface StageDefinitionDto {
  id: StageDefinitionId;
  /** Stable machine key (`intake`, `execution`, …). */
  key: string;
  label: string;
  statusCategory: StatusCategory;
  sortOrder: number;
}

/**
 * v2 (slice 27). A lightweight lifecycle summary for the S3 intake "Lifecycle" picker and the
 * S31 dropdown selector — GET /workspaces/{id}/lifecycles. The lifecycle `name` is the single
 * user-facing label (the separate "Request type" was dropped in v2). Ordered by sortOrder, then name.
 */
export interface LifecycleSummaryDto {
  id: LifecycleId;
  name: string;
  isDefault: boolean;
}

/** A workspace lifecycle — one per request type, exactly one default. */
export interface LifecycleDto {
  id: LifecycleId;
  name: string;
  /** The request type a caller picks at intake to select this lifecycle. */
  requestType: string;
  isDefault: boolean;
  stages: StageDefinitionDto[];
  gates: GateDefinitionDto[];
  sortOrder: number;
}

/** One member of an approver team (a real workspace user). */
export interface ApproverTeamMemberDto {
  userId: UserId;
  displayName: string;
  /**
   * Member email — populated on the S29 Approver-teams roster read (member rows show it). Absent on
   * other producers of this shape (e.g. a frozen approver slot's eligible members).
   */
  email?: string;
}

/** The roster for one role label. */
export interface ApproverTeamDto {
  roleLabel: string;
  /**
   * Catalog id of the role label — enables rename / delete of the team. Null for a retired label
   * that still has live members (surfaced with its roster but not editable).
   */
  roleLabelId?: string | null;
  members: ApproverTeamMemberDto[];
}

/** GET /workspaces/{id}/lifecycle — the whole S31 surface. */
export interface LifecycleConfigDto {
  workspaceId: WorkspaceId;
  lifecycles: LifecycleDto[];
  /** Role-label catalog (RoleLabelCatalog read; full CRUD is S37). */
  roleLabels: string[];
  approverTeams: ApproverTeamDto[];
}

// ─── PATCH /workspaces/{id}/lifecycle — full-config reconcile bodies ──────────

export interface StageUpsertDto {
  /** Omit for a new stage; the server mints an id. */
  id?: StageDefinitionId;
  key: string;
  label: string;
  statusCategory: StatusCategory;
  sortOrder: number;
}

export interface GateSlotUpsertDto {
  roleLabel: string;
}

export interface GateUpsertDto {
  id?: GateDefinitionId;
  name: string;
  /** Stage keys within this lifecycle (resolved to StageDefinition ids server-side). */
  fromStageKey: string;
  toStageKey: string;
  slots: GateSlotUpsertDto[];
}

export interface LifecycleUpsertDto {
  id?: LifecycleId;
  name: string;
  requestType: string;
  isDefault: boolean;
  sortOrder: number;
  stages: StageUpsertDto[];
  gates: GateUpsertDto[];
}

export interface LifecycleConfigUpdateRequest {
  lifecycles: LifecycleUpsertDto[];
}

/** POST /workspaces/{id}/approver-teams — add a resolved member. */
export interface ApproverTeamAddRequest {
  roleLabel: string;
  /** A display name or email; resolved to a workspace member server-side. */
  person: string;
}

/** DELETE /workspaces/{id}/approver-teams — remove a member. */
export interface ApproverTeamRemoveRequest {
  roleLabel: string;
  userId: UserId;
}
