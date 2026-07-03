// Gates and Approvals — the sign-off machinery.

import type { ApprovalRequestId, GateDefinitionId, IsoDateTime, RecordId, StageDefinitionId, UserId } from './common';

/** ApprovalRequest state — the gate as a whole, not per-slot. */
export type ApprovalRequestState = 'Pending' | 'ChangesRequested' | 'Resolved';

/** Per-slot decision. */
export type SlotDecision = 'Pending' | 'Approved' | 'Rejected';

/**
 * Frozen approver-slot snapshot — the team the slot targets (identified by role label)
 * plus the eligible member list at gate-open. Per prototype changelog:
 *   "gate approver slots now identify only the team/role label"
 * The actual signer is captured on decision.
 */
export interface FrozenApproverSlot {
  slotIndex: number;
  roleLabel: string;
  /** The team / role label — the actual users eligible are looked up from the frozen list below. */
  eligibleUserIds: UserId[];
  /** Human-readable label — copied at freeze. */
  displayLabel: string;
}

/** Represents one signer's decision on a slot. */
export interface ApprovalDecisionDto {
  slotIndex: number;
  decision: SlotDecision;
  decidedByUserId?: UserId;
  decidedAt?: IsoDateTime;
  comment?: string;
  isProxy: boolean;
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
