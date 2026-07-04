// Enumerable field-schema options, as typed module-level constants (web-component-architecture.md —
// never inline JSX for a rendered list). The full field-type catalog is §2.3; the Task tab offers
// the narrower typed-field library (S30). Stage keys mirror the six-stage seed (§7.1).

import type { FieldObjectType, FieldType, RuleAction, RuleComparator } from '@shared/types';

export const OBJECT_TYPES: readonly FieldObjectType[] = ['Request', 'Task', 'Feature'];

interface Option {
  readonly value: string;
  readonly label: string;
}

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

export const STAGE_KEYS: readonly string[] = ['intake', 'discovery', 'build', 'qa', 'deploy', 'post-launch'];

export const SELECT_TYPES: readonly FieldType[] = ['SingleSelect', 'MultiSelect'];
export const NUMERIC_TYPES: readonly FieldType[] = ['Number', 'Decimal', 'Currency', 'Percent'];

export function fieldTypeLabel(fieldType: string): string {
  return FIELD_TYPE_OPTIONS.find((option) => option.value === fieldType)?.label ?? fieldType;
}
