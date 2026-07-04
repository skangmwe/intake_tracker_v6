// Fields & Objects — the schema-engine vocabulary (BS §2.3, §3, §17).
// Consumed by both web/ and api/. Do not edit without updating shared-types.md.
//
// A workspace's field schema is a set of FieldDefinitions per object type. Fields may
// carry select options, condition-engine rules (show/hide/require/produce-value), and a
// derived-field configuration (Calculation or Derived-category). Platform-defined fields
// (§4.3) render as a read-only band whose definition is central (S34) and presentation local.

import type { FieldDefinitionId, IsoDateTime, UserId, WorkspaceId } from './common';

/** The object a field belongs to. One metadata engine underlies all record types (§2.4/§2.5). */
export type FieldObjectType = 'Request' | 'Task' | 'Feature';

/**
 * The fixed field-type catalog (BS §2.3). Files are the Attachments object, never a field type.
 */
export type FieldType =
  | 'ShortText'
  | 'LongText'
  | 'RichText'
  | 'Number'
  | 'Decimal'
  | 'Currency'
  | 'Percent'
  | 'Date'
  | 'DateTime'
  | 'SingleSelect'
  | 'MultiSelect'
  | 'Boolean'
  | 'UserReference'
  | 'RecordReference'
  | 'Url'
  | 'Calculation'
  | 'DerivedCategory';

/**
 * The task-level typed-field library subset (S30 / blueprint) — the structured field a Task
 * carries. A narrower catalog than the full FieldType set; analysts pick from it, admins extend it.
 */
export type TaskLibraryFieldType = 'Url' | 'Text' | 'Number' | 'Date' | 'Select' | 'Checkbox';

/**
 * Field classification — the crossing tags of §17. Maps [S]/[A]/[P]/● to explicit names.
 * - `Crossing`       [S] — user-editable content field that maps 1:1 to a same-named AI-side field.
 * - `AiSide`         [A] — local to the AI Solutions workspace; never crosses.
 * - `Platform`       [P] — defined centrally (S34); referenced read-only in every workspace.
 * - `WorkspaceLocal` ●   — the workspace's own local field (editable, or derived/read-only).
 */
export type FieldCategory = 'Crossing' | 'AiSide' | 'Platform' | 'WorkspaceLocal';

/** A condition-engine rule action (BS §3.1). */
export type RuleAction = 'Show' | 'Hide' | 'Require' | 'ProduceValue';

/**
 * A condition-engine comparator. Phase 1 compares a field value against a literal only;
 * the current-date / current-user references (§3.1) are Phase 2.
 */
export type RuleComparator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'isSet'
  | 'isNotSet'
  | 'contains';

/** A derived field is either a numeric Calculation (§3.3) or a Derived-category (§3.4). */
export type DerivedFieldKind = 'Calculation' | 'DerivedCategory';

/** A select option belonging to a Single-/Multi-select field. */
export interface SelectOptionDto {
  id: string;
  value: string;
  label: string;
  sortOrder: number;
}

/**
 * A condition-engine rule attached to a field. `action` names what happens to the target field;
 * `whenFieldKey` + `comparator` + `compareValue` is the condition read against another field.
 * For `ProduceValue` (Derived-category, first-match-wins by `sortOrder`), `produceValue` is the label.
 */
export interface FieldRuleDto {
  id: string;
  action: RuleAction;
  whenFieldKey: string;
  comparator: RuleComparator;
  compareValue: string | null;
  produceValue: string | null;
  sortOrder: number;
}

/** Derived-field configuration — a Calculation expression or a Derived-category default. */
export interface DerivedFieldDto {
  kind: DerivedFieldKind;
  /** Numeric expression for a Calculation field, e.g. `BusinessValue + EfficiencyGain - LevelOfEffort`. */
  expression: string | null;
  /** Optional default/else value for a Derived-category field. */
  defaultValue: string | null;
}

/** A field definition — the per-workspace schema unit. */
export interface FieldDefinitionDto {
  id: FieldDefinitionId;
  workspaceId: WorkspaceId;
  objectType: FieldObjectType;
  /** Stable machine key, unique per (workspace, objectType). */
  fieldKey: string;
  displayName: string;
  fieldType: FieldType;
  category: FieldCategory;
  section: string | null;
  helpText: string | null;
  isRequired: boolean;
  isReadOnly: boolean;
  /** True when this is a reference to a platform-defined field (§4.3) — read-only band. */
  isPlatformDefined: boolean;
  /** The platform field key when isPlatformDefined; the central definition wins. */
  platformFieldKey: string | null;
  /** Stage keys the field is visible on. `null` = all stages (§3.2). */
  visibleStages: string[] | null;
  /** The same-named AI-side target key for a Crossing ([S]) field's 1:1 seed map. */
  crossingToFieldKey: string | null;
  /** Numeric validation bounds (e.g. Business Value 1–5). */
  minValue: number | null;
  maxValue: number | null;
  /** Multi-select allow-new-values toggle. */
  allowNewValues: boolean;
  sortOrder: number;
  isRetired: boolean;
  options: SelectOptionDto[];
  rules: FieldRuleDto[];
  derived: DerivedFieldDto | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Create/replace a workspace field. Rules + options are replaced wholesale on upsert. */
export interface FieldDefinitionUpsertRequest {
  objectType: FieldObjectType;
  fieldKey: string;
  displayName: string;
  fieldType: FieldType;
  category: FieldCategory;
  section?: string | null;
  helpText?: string | null;
  isRequired?: boolean;
  visibleStages?: string[] | null;
  crossingToFieldKey?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  allowNewValues?: boolean;
  sortOrder?: number;
  options?: Array<{ value: string; label: string; sortOrder: number }>;
  rules?: Array<Omit<FieldRuleDto, 'id'>>;
  derived?: DerivedFieldDto | null;
}

/** Sparse edit of an existing field. Omitted properties are left unchanged. */
export interface FieldDefinitionPatchRequest {
  displayName?: string;
  section?: string | null;
  helpText?: string | null;
  isRequired?: boolean;
  visibleStages?: string[] | null;
  minValue?: number | null;
  maxValue?: number | null;
  allowNewValues?: boolean;
  sortOrder?: number;
  options?: Array<{ value: string; label: string; sortOrder: number }>;
  rules?: Array<Omit<FieldRuleDto, 'id'>>;
  derived?: DerivedFieldDto | null;
}

/**
 * A task-library field — a reusable typed field a Task can capture (S30 field library).
 * Seed examples: Repo URL, Design doc URL, Accuracy %, Go-live date, Environment, Privacy signed off.
 */
export interface TaskLibraryFieldDto {
  id: FieldDefinitionId;
  fieldKey: string;
  displayName: string;
  fieldType: TaskLibraryFieldType;
  options: SelectOptionDto[];
  sortOrder: number;
  isRetired: boolean;
}

export interface TaskLibraryFieldUpsertRequest {
  fieldKey: string;
  displayName: string;
  fieldType: TaskLibraryFieldType;
  options?: Array<{ value: string; label: string; sortOrder: number }>;
  sortOrder?: number;
}

/**
 * A platform-defined field (S34). Definition is central; only a Platform admin edits it, and the
 * edit applies to every workspace at once (§4.3). `hasManualWritePath` is false for AI Solutions
 * Status — it is written only by the bridge off the event spine (§6.4).
 */
export interface PlatformFieldDto {
  id: string;
  fieldKey: string;
  displayName: string;
  fieldType: string;
  /** 'System' | 'Platform' | 'Derived'. */
  category: string;
  isSystemImmutable: boolean;
  hasManualWritePath: boolean;
  selectOptions: string[] | null;
}

/** Sparse edit of a platform field (S34). System fields are immutable to everyone (§4.3). */
export interface PlatformFieldPatchRequest {
  displayName?: string;
  selectOptions?: string[] | null;
}

/**
 * The result of validating a workspace's field-rule dependency graph at save (§3.1):
 * the graph must be acyclic and no deeper than three levels.
 */
export interface FieldRuleGraphValidationResult {
  isValid: boolean;
  maxDepth: number;
  /** Field-key cycle path when a cycle is present. */
  cyclePath: string[] | null;
  errors: string[];
}

/** GET response for a workspace's field schema, grouped for the S30 admin surface. */
export interface WorkspaceFieldSchemaDto {
  workspaceId: WorkspaceId;
  objectType: FieldObjectType;
  fields: FieldDefinitionDto[];
  /** Platform-defined read-only band (§4.3), resolved from the central definition. */
  platformFields: PlatformFieldDto[];
}

/** Actor context echoed on config-audit surfaces. */
export interface FieldConfigActor {
  userId: UserId;
}
