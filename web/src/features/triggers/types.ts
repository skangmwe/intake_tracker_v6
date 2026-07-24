// Trigger-admin feature types (slice: triggers-request-authoring, Task 2.3). These mirror the API
// contract in api/Api/Modules/Triggers/TriggerDtos.cs — an Authored Request trigger and its ANDed
// conditions. ObjectType/Kind are fixed server-side to Request/Authored for this slice; the editor
// never sends them, and the built-in Task/Approval kinds arrive in later slices.

export type TriggerCadence = 'Once' | 'RepeatEveryNDays';

export type TriggerCategory = 'sla-reminder' | 'benefit-review';

export type TriggerRecipientKey = 'assignedAnalyst' | 'businessOwner' | 'requestor' | 'watchers';

export type TriggerComparator =
  | 'isSet'
  | 'isNotSet'
  | 'eq'
  | 'neq'
  | 'contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

/** One ANDed "when" clause: a field + comparator (+ value, unless the comparator is set/not-set). */
export interface TriggerConditionDto {
  whenFieldKey: string;
  comparator: TriggerComparator;
  compareValue: string | null;
}

/** A trigger as returned to the admin UI. */
export interface TriggerDto {
  triggerId: string;
  objectType: string;
  kind: string;
  name: string;
  isEnabled: boolean;
  cadence: TriggerCadence;
  repeatIntervalDays: number | null;
  windowDays: number | null;
  notificationCategory: TriggerCategory;
  recipients: string[];
  notificationTitle: string;
  notificationBody: string;
  conditions: TriggerConditionDto[];
}

/** Create/update payload for an Authored Request trigger. */
export interface TriggerUpsertRequest {
  name: string;
  isEnabled: boolean;
  cadence: TriggerCadence;
  repeatIntervalDays: number | null;
  notificationCategory: TriggerCategory;
  recipients: string[];
  notificationTitle: string;
  notificationBody: string;
  conditions: TriggerConditionDto[];
}
