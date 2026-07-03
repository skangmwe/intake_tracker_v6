// Feature Catalog — reusable-feature inventory (BS §2.5 / §18).

import type { IsoDateTime, RecordId, UserId, WorkspaceId } from './common';

export type FeatureMaturity = 'Draft' | 'Published' | 'Deprecated';

export type FeatureType = 'UI/visual' | 'Functional' | 'Integration' | 'Workflow' | 'Data/reporting';

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
  owner: UserId;
  sourcedFromRecordIds?: RecordId[];
}

/** A single row on the Feature Catalog list / gallery. */
export interface FeatureListRow {
  id: RecordId;
  name: string;
  oneLiner: string;
  featureType: FeatureType;
  capabilityTags: string[];
  techStack: string[];
  owner: UserId;
  maturity: FeatureMaturity;
  /** For gallery — first image attachment URL, if any. */
  thumbnailUrl?: string;
}
