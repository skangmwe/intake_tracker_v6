// Request-specific data-driven form logic (S3 intake + S4 Intake tab). The generic field-form
// helpers were extracted to @/shared/fields/fieldForm (now shared with custom-object records) and
// are re-exported here so existing Request call-sites are unchanged. Only the Request-specific
// pieces — the fixed create-form sections and the Priority Score formula — live in this file.

import type { FieldValueMap } from '@/shared/fields/fieldForm';

export {
  groupFieldsBySection,
  filterSections,
  evaluateComparator,
  evaluateFieldConditions,
  validateFieldForm as validateRequestForm,
} from '@/shared/fields/fieldForm';
export type { FieldValueMap, FieldSectionGroup, FieldConditionState } from '@/shared/fields/fieldForm';

/** The sections the S3 create form surfaces, in order (the four numbered sections in the prototype). */
export const INTAKE_CREATE_SECTIONS = ['Intake', 'Value mapping', 'Solution details', 'Triage'] as const;

/** Priority Score = Business Value + Efficiency Gain − Level of Effort (BS §3.3). */
export function computePriorityScore(values: FieldValueMap): number {
  const businessValue = Number(values.businessValue ?? 0) || 0;
  const efficiencyGain = Number(values.efficiencyGain ?? 0) || 0;
  const levelOfEffort = Number(values.levelOfEffort ?? 0) || 0;
  return businessValue + efficiencyGain - levelOfEffort;
}
