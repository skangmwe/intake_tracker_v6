// Feature Catalog — reusable-feature inventory (BS §2.5 / §18).

import type { DraftId, IsoDateTime, RecordId, UserId, WorkspaceId } from './common';
import type { QueuedLink } from './collaboration';

export type FeatureMaturity = 'Draft' | 'Published' | 'Deprecated';

export type FeatureType =
  'UI/visual' | 'Functional' | 'Integration' | 'Workflow' | 'Data/reporting';

export interface FeatureDto {
  id: RecordId;
  /** Always the AI Solutions workspace — features never leave the hub. */
  workspaceId: WorkspaceId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  createdBy: UserId;
  updatedBy: UserId;

  name: string;
  oneLiner: string;
  whatItDoes: string;

  featureType: FeatureType;
  capabilityTags: string[];
  solutionPattern: string[];
  techStack: string[];

  howToReuse: string;
  demoUrl?: string;
  repoUrl?: string;
  owner: UserId;

  maturity: FeatureMaturity;
  dataClassification?: string;
  complianceFlags: string[];

  /** `sourced-from` links to source Requests. Optional — a feature may stand alone. */
  sourcedFromRecordIds: RecordId[];

  /** ROWVERSION ETag for optimistic-concurrency edits (FeaturePatchRequest.ifMatch). */
  eTag: string;
}

export interface FeatureCreateRequest {
  name: string;
  oneLiner: string;
  whatItDoes: string;
  featureType: FeatureType;
  capabilityTags?: string[];
  solutionPattern?: string[];
  techStack?: string[];
  howToReuse?: string;
  demoUrl?: string;
  repoUrl?: string;
  /** The maintainer. Optional — a stand-alone feature may have no assigned owner yet (BS §18.4). */
  owner?: UserId;
  sourcedFromRecordIds?: RecordId[];
  /**
   * Link-backs queued on an Add-to-catalog draft (BS §5) — a `sourced-from` link to the source
   * Request, stamped from the newly-minted feature at submission. Mirrors RequestCreateRequest.
   */
  queuedLinks?: QueuedLink[];
}

/** PATCH /features/{id}. Sparse — send only the fields that changed. */
export interface FeaturePatchRequest {
  name?: string;
  fields?: Record<string, unknown>;
  /**
   * ETag from the last-loaded feature. Server returns 409 stale-record if it doesn't match; the
   * client refetches and reapplies (`web-state-management.md`). Maturity is not edited here —
   * publish/deprecate are their own endpoints.
   */
  ifMatch: string;
}

/** POST /requests/{id}/add-to-catalog — prefills a Feature draft from a shipped Request. */
export interface AddToCatalogResult {
  draftId: DraftId;
}

/** A single row on the Feature Catalog list / gallery. */
export interface FeatureListRow {
  id: RecordId;
  /** ROWVERSION ETag — carried so an inline edit / detail open has concurrency context. */
  eTag: string;
  name: string;
  oneLiner: string;
  featureType: FeatureType;
  capabilityTags: string[];
  techStack: string[];
  owner: UserId;
  maturity: FeatureMaturity;
  /** The originating workspace name (always "AI Solutions" in Phase 1). */
  origin: string;
  updatedAt: IsoDateTime;
  /** For gallery — first image attachment URL, if any. */
  thumbnailUrl?: string;
}
