// Enumerable field-schema options, as typed module-level constants (web-component-architecture.md —
// never inline JSX for a rendered list). The full field-type catalog is §2.3; the Task tab offers
// the narrower typed-field library (S30). Stage keys mirror the six-stage seed (§7.1).

import type {
  FieldLocation,
  FieldObjectType,
  FieldSource,
  FieldType,
  RuleAction,
  RuleComparator,
} from '@shared/types';

export const OBJECT_TYPES: readonly FieldObjectType[] = ['Request', 'Task', 'Feature'];

interface Option {
  readonly value: string;
  readonly label: string;
}

// The five built-in objects for the reconciled New Field picker. Value is the machine key; only
// ToolkitItem's label differs. Attachment/Toolkit item accept custom fields (migration 073).
export const OBJECT_OPTIONS: readonly { value: FieldObjectType; label: string }[] = [
  { value: 'Request', label: 'Request' },
  { value: 'Task', label: 'Task' },
  { value: 'Attachment', label: 'Attachment' },
  { value: 'Feature', label: 'Feature' },
  { value: 'ToolkitItem', label: 'Toolkit item' },
];

export function objectLabel(objectType: string): string {
  return OBJECT_OPTIONS.find((option) => option.value === objectType)?.label ?? objectType;
}

// Field scope. Platform (stored value 'Global') = available to every workspace; 'LocalWorkspace'
// to this one only. Display label only — the stored value stays 'Global'.
export const FIELD_LOCATION_OPTIONS: readonly { value: FieldLocation; label: string }[] = [
  { value: 'LocalWorkspace', label: 'Local Workspace' },
  { value: 'Global', label: 'Platform' },
];

export function fieldLocationLabel(location: string): string {
  return FIELD_LOCATION_OPTIONS.find((option) => option.value === location)?.label ?? location;
}

// Select-filter option sets for the catalog table's funnels.
export const SOURCE_FILTER_OPTIONS: readonly Option[] = [
  { value: 'System', label: 'System' },
  { value: 'User', label: 'User' },
];

export const REQUIRED_FILTER_OPTIONS: readonly Option[] = [
  { value: 'Required', label: 'Required' },
  { value: 'Optional', label: 'Optional' },
];

export const STATUS_FILTER_OPTIONS: readonly Option[] = [
  { value: 'Active', label: 'Active' },
  { value: 'Draft', label: 'Draft' },
  { value: 'Archived', label: 'Archived' },
];

export const FIELD_TYPE_OPTIONS: readonly { value: FieldType; label: string }[] = [
  { value: 'ShortText', label: 'Short text' },
  { value: 'LongText', label: 'Long text' },
  { value: 'RichText', label: 'Rich text' },
  { value: 'Number', label: 'Number' },
  { value: 'Decimal', label: 'Decimal' },
  { value: 'Currency', label: 'Currency' },
  { value: 'Percent', label: 'Percent' },
  { value: 'Date', label: 'Date' },
  { value: 'DateTime', label: 'Date & time' },
  { value: 'SingleSelect', label: 'Single-select' },
  { value: 'MultiSelect', label: 'Multi-select' },
  { value: 'Boolean', label: 'Boolean' },
  { value: 'UserReference', label: 'User reference' },
  { value: 'RecordReference', label: 'Record reference' },
  { value: 'Url', label: 'URL' },
  { value: 'Calculation', label: 'Calculation (derived)' },
  { value: 'DerivedCategory', label: 'Derived category' },
];

// The Task field library (S30) — the narrower structured-field set analysts pick from.
export const TASK_FIELD_TYPE_OPTIONS: readonly { value: FieldType; label: string }[] = [
  { value: 'Url', label: 'URL' },
  { value: 'ShortText', label: 'Text' },
  { value: 'Number', label: 'Number' },
  { value: 'Date', label: 'Date' },
  { value: 'SingleSelect', label: 'Select' },
  { value: 'Boolean', label: 'Checkbox' },
];

export const CATEGORY_OPTIONS: readonly Option[] = [
  { value: 'WorkspaceLocal', label: 'Workspace-local' },
  { value: 'Crossing', label: 'Crossing (PG ↔ AI)' },
  { value: 'AiSide', label: 'AI-side only' },
];

export const RULE_ACTION_OPTIONS: readonly { value: RuleAction; label: string }[] = [
  { value: 'Show', label: 'Show' },
  { value: 'Hide', label: 'Hide' },
  { value: 'Require', label: 'Require' },
];

export const COMPARATOR_OPTIONS: readonly { value: RuleComparator; label: string }[] = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'does not equal' },
  { value: 'gt', label: 'is greater than' },
  { value: 'gte', label: 'is at least' },
  { value: 'lt', label: 'is less than' },
  { value: 'lte', label: 'is at most' },
  { value: 'isSet', label: 'is set' },
  { value: 'isNotSet', label: 'is not set' },
  { value: 'contains', label: 'contains' },
];

export const STAGE_KEYS: readonly string[] = [
  'intake',
  'triage',
  'execution',
  'validation',
  'delivery',
  'stabilization',
  'closure',
];

export const SELECT_TYPES: readonly FieldType[] = ['SingleSelect', 'MultiSelect'];
export const NUMERIC_TYPES: readonly FieldType[] = ['Number', 'Decimal', 'Currency', 'Percent'];

export function fieldTypeLabel(fieldType: string): string {
  return FIELD_TYPE_OPTIONS.find((option) => option.value === fieldType)?.label ?? fieldType;
}

/**
 * The lock-banner copy shown when a locked field opens read-only, keyed on its provenance.
 * (Moved verbatim out of the deleted FieldReadOnlySheet.) A read-only 'User' row is a foreign
 * Global field surfaced from the owning workspace.
 */
export function lockMessageForSource(source: FieldSource): string {
  if (source === 'System') {
    return 'This is a system field, provisioned automatically on every object. It can’t be edited, archived, or deleted.';
  }
  if (source === 'Platform') {
    return 'This is a platform-defined field managed centrally. It can’t be edited here.';
  }
  return 'This is a global field owned by a workspace. It can only be changed from the workspace that created it.';
}
