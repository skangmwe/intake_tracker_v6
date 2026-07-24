// Pure form <-> request mapping for the trigger editor (slice: triggers-request-authoring, Task 2.3).
// Kept out of the component so the round-trip is unit-testable without a render. The editor holds a
// TriggerForm; formToRequest normalises it into the API payload (drop the interval unless the cadence
// repeats; null out the value on set/not-set comparators).

import {
  DEFAULT_REPEAT_INTERVAL_DAYS,
  TODAY_TOKEN,
  VALUELESS_COMPARATORS,
} from './constants';
import type {
  TriggerCadence,
  TriggerCategory,
  TriggerComparator,
  TriggerDto,
  TriggerUpsertRequest,
} from './types';

/** A single editable condition row. `id` is client-only, for stable list keys. */
export interface ConditionRow {
  id: string;
  whenFieldKey: string;
  comparator: TriggerComparator;
  compareValue: string;
}

export interface TriggerForm {
  name: string;
  isEnabled: boolean;
  cadence: TriggerCadence;
  repeatIntervalDays: number;
  notificationCategory: TriggerCategory;
  recipients: string[];
  notificationTitle: string;
  notificationBody: string;
  conditions: ConditionRow[];
}

function newConditionId(): string {
  return crypto.randomUUID();
}

/** A single empty condition row seeded with the first available field key (or blank). */
export function emptyCondition(defaultFieldKey: string): ConditionRow {
  return { id: newConditionId(), whenFieldKey: defaultFieldKey, comparator: 'eq', compareValue: '' };
}

/** Build the editor form from an existing trigger, or a blank opt-in-disabled draft for a new one. */
export function buildInitialForm(trigger: TriggerDto | null, defaultFieldKey: string): TriggerForm {
  if (trigger === null) {
    return {
      name: '',
      isEnabled: false,
      cadence: 'Once',
      repeatIntervalDays: DEFAULT_REPEAT_INTERVAL_DAYS,
      notificationCategory: 'sla-reminder',
      recipients: [],
      notificationTitle: '',
      notificationBody: '',
      conditions: [emptyCondition(defaultFieldKey)],
    };
  }

  return {
    name: trigger.name,
    isEnabled: trigger.isEnabled,
    cadence: trigger.cadence,
    repeatIntervalDays: trigger.repeatIntervalDays ?? DEFAULT_REPEAT_INTERVAL_DAYS,
    notificationCategory: trigger.notificationCategory,
    recipients: [...trigger.recipients],
    notificationTitle: trigger.notificationTitle,
    notificationBody: trigger.notificationBody,
    conditions: trigger.conditions.map((condition) => ({
      id: newConditionId(),
      whenFieldKey: condition.whenFieldKey,
      comparator: condition.comparator,
      compareValue: condition.compareValue ?? '',
    })),
  };
}

/** True when the comparator carries a value (i.e. not set / not-set). */
export function comparatorTakesValue(comparator: TriggerComparator): boolean {
  return !VALUELESS_COMPARATORS.includes(comparator);
}

/** True when this row's value is the sweep-date token. */
export function isTodayValue(compareValue: string): boolean {
  return compareValue === TODAY_TOKEN;
}

export function formToRequest(form: TriggerForm): TriggerUpsertRequest {
  return {
    name: form.name.trim(),
    isEnabled: form.isEnabled,
    cadence: form.cadence,
    repeatIntervalDays: form.cadence === 'RepeatEveryNDays' ? form.repeatIntervalDays : null,
    notificationCategory: form.notificationCategory,
    recipients: form.recipients,
    notificationTitle: form.notificationTitle.trim(),
    notificationBody: form.notificationBody.trim(),
    conditions: form.conditions.map((row) => ({
      whenFieldKey: row.whenFieldKey.trim(),
      comparator: row.comparator,
      compareValue: comparatorTakesValue(row.comparator)
        ? row.compareValue.trim() === ''
          ? null
          : row.compareValue.trim()
        : null,
    })),
  };
}
