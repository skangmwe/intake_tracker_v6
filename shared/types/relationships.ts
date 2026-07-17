// Relationships — object-level relationship definitions (v2, slice 25).
// See v2-reconciliation.md §Model deltas 1 and §API deltas Relationships.
//
// A Relationship is workspace-owned metadata that pairs two objects with a cardinality.
// Creating a Relationship auto-provisions the Link-to-record fields on the owning side(s)
// via the Fields & Objects schema engine (the paired FieldDefinition rows carry
// relationshipId = this row's id). A Relationship can optionally surface as a
// relationship-driven tab on the From-side detail via the ShowOnFromAsTab toggle.
//
// Relationships are workspace-local — cross-workspace relationships are not modeled.
// (Cross-workspace linkage is the escalation bridge's exclusive job — BS §6.1.)

import type {
  IsoDateTime,
  RecordId,
  RelationshipId,
  UserId,
  WorkspaceId,
} from './common';
import type { FieldObjectType } from './fields';

/**
 * Cardinality of a Relationship. Auto-provisioning behavior:
 *   - `OneToOne`:  single Link-to-record field on the From side.
 *   - `OneToMany`: single Link-to-record field on the To side pointing back to the From side.
 *   - `ManyToMany`: multi Link-to-record fields on both sides.
 */
export type RelationshipCardinality = 'OneToOne' | 'OneToMany' | 'ManyToMany';

/**
 * A Relationship definition. The Fields & Objects surface (S30) manages these on its
 * Relationships tab. Auto-provisioned fields are read-only in the Fields editor and
 * appear grouped under a "Relationships" section with a lock affordance.
 */
export interface RelationshipDto {
  id: RelationshipId;
  workspaceId: WorkspaceId;
  /** Human-readable relationship name, e.g. "Request has Tasks". */
  name: string;
  fromObjectType: FieldObjectType;
  toObjectType: FieldObjectType;
  cardinality: RelationshipCardinality;
  /** Rendered on the From-side detail (e.g. "Tasks"). */
  fromSideLabel: string;
  /** Rendered on the To-side detail (e.g. "Request"). */
  toSideLabel: string;
  /**
   * When true, the From-side detail renders this relationship as a tab in the config-driven
   * tab bar. Tab insertion is per `sortOrder` relative to other relationship tabs on the same
   * object; the two seeded relationships (Request → Tasks; Request → Attachments) come first
   * by convention.
   */
  showOnFromAsTab: boolean;
  /** Tab label — surfaces when `showOnFromAsTab=true`. */
  tabLabel?: string;
  sortOrder: number;
  isRetired: boolean;
  /**
   * v2 (slice 25). System-seeded relationships (Request → Task, seeded by migration
   * 20260716_058) drive the config-driven tab bar's always-on relationship-driven tabs.
   * The S30 admin surface blocks the edit and retire affordances on these rows.
   */
  isSystem: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  createdBy: UserId;
  updatedBy: UserId;
}

/**
 * POST /relationships/{id}/retire response. When `linkCount > 0` and `retired = false`,
 * the server refused to soft-retire because live RecordLinks would be hidden — the
 * caller (S30 admin editor) confirms via `?force=true`, which retries with force = 1
 * and gets `retired = true`.
 */
export interface RelationshipRetireResponse {
  relationshipId: RelationshipId;
  linkCount: number;
  retired: boolean;
}

/** POST /workspaces/{id}/relationships — server auto-provisions the paired Link-to-record fields. */
export interface RelationshipCreateRequest {
  name: string;
  fromObjectType: FieldObjectType;
  toObjectType: FieldObjectType;
  cardinality: RelationshipCardinality;
  fromSideLabel: string;
  toSideLabel: string;
  showOnFromAsTab?: boolean;
  tabLabel?: string;
  sortOrder?: number;
}

/**
 * PATCH /relationships/{id} — sparse update. `cardinality`, `fromObjectType`, and `toObjectType`
 * are immutable after creation (changing them would rebuild the auto-provisioned Link-to-record
 * fields and orphan link rows). Retire via the /retire endpoint, not this patch.
 */
export interface RelationshipPatchRequest {
  name?: string;
  fromSideLabel?: string;
  toSideLabel?: string;
  showOnFromAsTab?: boolean;
  tabLabel?: string;
  sortOrder?: number;
}

/**
 * One linked-record row for the S4 Relationships side panel + the generic relationship tab.
 * Access-respecting: the API drops rows the caller can't see (returns them from procs but
 * filters at the boundary).
 */
export interface RelationshipLinkDto {
  id: string;
  relationshipId: RelationshipId;
  fromRecordId: RecordId;
  toRecordId: RecordId;
  /** Display fields carried to avoid a second fetch per row. */
  toRecordDisplayName: string;
  toRecordStage?: string;
  /**
   * v2 (slice 25). `'Out'` when the viewed record is the FROM side (the counterparty is
   * on `toRecordId`); `'In'` when the viewed record is the TO side (the counterparty is
   * on `fromRecordId`). The web renders the appropriate side label from the
   * Relationship (fromSideLabel vs toSideLabel) based on direction.
   */
  direction: 'Out' | 'In';
  createdAt: IsoDateTime;
  createdBy: UserId;
}

/** POST /records/{recordId}/links — one linked-record row. */
export interface RelationshipLinkCreateRequest {
  relationshipId: RelationshipId;
  toRecordId: RecordId;
}
