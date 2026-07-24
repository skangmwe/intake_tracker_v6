// Enumerable trigger-editor options, as typed module-level constants (web-component-architecture.md —
// never inline JSX for a rendered list). The comparator, recipient, and category sets mirror
// TriggerRequestValidator.cs exactly — the server rejects anything outside them.

import type {
  TriggerCadence,
  TriggerCategory,
  TriggerComparator,
  TriggerRecipientKey,
} from './types';

interface Option<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
}

export const CADENCE_OPTIONS: readonly Option<TriggerCadence>[] = [
  { value: 'Once', label: 'Once' },
  { value: 'RepeatEveryNDays', label: 'Repeat every N days' },
];

export const CATEGORY_OPTIONS: readonly Option<TriggerCategory>[] = [
  { value: 'sla-reminder', label: 'SLA reminder' },
  { value: 'benefit-review', label: 'Benefit review' },
];

export const RECIPIENT_OPTIONS: readonly Option<TriggerRecipientKey>[] = [
  { value: 'assignedAnalyst', label: 'Assigned analyst' },
  { value: 'businessOwner', label: 'Business owner' },
  { value: 'requestor', label: 'Requestor' },
  { value: 'watchers', label: 'Watchers' },
];

export const COMPARATOR_OPTIONS: readonly Option<TriggerComparator>[] = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'does not equal' },
  { value: 'gt', label: 'is greater than' },
  { value: 'gte', label: 'is at least' },
  { value: 'lt', label: 'is less than' },
  { value: 'lte', label: 'is at most' },
  { value: 'contains', label: 'contains' },
  { value: 'isSet', label: 'is set' },
  { value: 'isNotSet', label: 'is not set' },
];

/** Comparators that carry no value — the value control is hidden for these. */
export const VALUELESS_COMPARATORS: readonly TriggerComparator[] = ['isSet', 'isNotSet'];

/** The literal the engine resolves to the sweep date — a condition can compare a date field to it. */
export const TODAY_TOKEN = '@today';

/** The default repeat interval when a trigger first switches to the repeat cadence. */
export const DEFAULT_REPEAT_INTERVAL_DAYS = 1;

export function cadenceLabel(cadence: string): string {
  return CADENCE_OPTIONS.find((option) => option.value === cadence)?.label ?? cadence;
}

export function categoryLabel(category: string): string {
  return CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
}

export function comparatorLabel(comparator: string): string {
  return COMPARATOR_OPTIONS.find((option) => option.value === comparator)?.label ?? comparator;
}
