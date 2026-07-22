// Platform-admin surfaces (Slice 19 — the S35–S39 firm-wide config band, module-boundaries §21).
// Every endpoint that produces these is gated on the caller's additive Platform-admin grant
// (MeDto.isPlatformAdmin); a non-admin gets 403, never 404. These are the vocabulary for:
//   S35 Crossing map (read-only in R1 Phase 1) · S36 Access provisioning · S37 Role-label catalog
//   S38 Workspace provisioning (API only this slice) · S39 Firm-wide audit.

import type { IsoDateTime, UserId, WorkspaceId, WorkspaceKind } from './common';
import type { AuditLogQuery, AuditLogRowDto } from './audit';

/* ── S35 Crossing map (propose / confirm, BS §6.2) ───────────────────────── */

/** A crossing-map row's provenance: an immutable seeded pair, or a durable admin-authored mapping. */
export type CrossingMapStatus = 'Seeded' | 'Proposed' | 'Confirmed';

/**
 * One PG→AI field mapping in the firm crossing map (slice 24). `source` is the PG/Dept field;
 * `target` is the AI Solutions field. A SEEDED row (`crossingMapId` null) is the immutable 1:1 pair
 * read off FieldDefinition; a DURABLE row (Proposed / Confirmed) comes from the CrossingMap table and
 * carries an id, the optional option-correspondence JSON, and the confirmed-by/at audit. Field types
 * are display strings from the schema.
 */
export interface CrossingMapRowDto {
  crossingMapId: string | null;
  sourceFieldKey: string;
  sourceDisplayName: string;
  sourceFieldType: string;
  targetFieldKey: string;
  targetDisplayName: string;
  targetFieldType: string;
  status: CrossingMapStatus;
  /** Select-type option map as raw JSON (PG option value → AI option value), or null. */
  optionCorrespondenceJson: string | null;
  confirmedByUserId: string | null;
  confirmedAt: IsoDateTime | null;
}

/** Body for POST /platform/crossing-map — propose a PG→AI mapping (validated server-side). */
export interface CrossingMapProposeRequest {
  pgFieldDefinitionId: string;
  aiFieldDefinitionId: string;
  /** Optional select-type option map, serialized JSON (PG option value → AI option value). */
  optionCorrespondenceJson?: string;
}

/** One mappable field for the S35 propose form (Side is 'PG' or 'AI'). */
export interface CrossingCandidateDto {
  fieldDefinitionId: string;
  side: 'PG' | 'AI';
  fieldKey: string;
  displayName: string;
  fieldType: string;
}

/** GET /platform/crossing-map/candidates response — the mappable fields on each side. */
export interface CrossingCandidatesDto {
  pgFields: CrossingCandidateDto[];
  aiFields: CrossingCandidateDto[];
}

/* ── S37 Role-label catalog (BS §7.2) ────────────────────────────────────── */

/** One platform-scope gate role label. The catalog S31's approver-slot selectors draw from. */
export interface RoleLabelDto {
  roleLabelId: string;
  label: string;
  sortOrder: number;
}

/** POST /platform/role-labels — add a label. Blank / duplicate → 400. */
export interface RoleLabelCreateRequest {
  label: string;
}

/**
 * PATCH /platform/role-labels/{id} — rename. Forward-only: past sign-offs and live gate slots keep
 * the label they were captured under (BS §7.2). Blank / unknown / collision → 400.
 */
export interface RoleLabelRenameRequest {
  label: string;
}

/* ── S36 Access provisioning (BS §4.2/§4.3) ──────────────────────────────── */

/**
 * A privileged grant in the S36 directory. `PlatformAdmin` = the additive firm-wide grant
 * (workspace fields null); `WorkspaceAdmin` = a per-workspace admin membership (read-only in S36 —
 * membership changes stay in S29 / the Users module).
 */
export type PrivilegedGrantKind = 'PlatformAdmin' | 'WorkspaceAdmin';

export interface PrivilegedGrantDto {
  grantKind: PrivilegedGrantKind;
  userId: UserId;
  /** PII — never logged (api-logging.md). Shown only to an entitled Platform admin. */
  displayName: string;
  /** PII — never logged. */
  email: string;
  workspaceId: WorkspaceId | null;
  workspaceName: string | null;
  grantedAt: IsoDateTime;
}

export interface PrivilegedGrantsListDto {
  grants: PrivilegedGrantDto[];
}

/**
 * POST /platform/access — grant the Platform-admin grant. Exactly one of `userId` / `email`:
 * `email` resolves an active platform user server-side (unresolved / ambiguous → 400), mirroring the
 * S29 membership add. There is no user-directory endpoint in R1.
 */
export interface PlatformAdminGrantRequest {
  userId?: UserId;
  email?: string;
}

/* ── S38 Workspace provisioning (BS §1.1 — API only this slice) ──────────── */

/** The provisioned workspace summary returned by POST /workspaces (clone of the PG/Dept template). */
export interface WorkspaceProvisionResult {
  id: WorkspaceId;
  name: string;
  kind: WorkspaceKind;
  prefix: string;
}

/* ── S39 Firm-wide audit (BS §12 / §4.3) ─────────────────────────────────── */

/** One firm-wide audit row — a workspace audit row plus the workspace name (cross-workspace feed). */
export interface FirmWideAuditRowDto extends AuditLogRowDto {
  workspaceName: string | null;
}

/**
 * POST /platform/audit/query body — the S39 filter bar. Same fixed filter set as the workspace audit
 * (date range / actor / record / event type) plus an optional workspace narrower; omit it for the
 * full cross-workspace feed.
 */
export interface FirmWideAuditQuery extends AuditLogQuery {
  workspaceId?: WorkspaceId;
}
