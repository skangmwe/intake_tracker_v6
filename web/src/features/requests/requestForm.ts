// Data-driven Request form logic (S3 intake + S4 Intake tab). Pure + unit-testable — no React.
//
// A Request form renders from the workspace's field schema (FieldDefinitionDto[]), grouped by
// section and ordered by sortOrder, with the condition engine's Show/Hide/Require rules evaluated
// client-side so interactions like the Client-number reveal happen live (the server re-validates on
// submit). This mirrors the seed rules in migration 019 (clientNumber Require when deptPgClient=Client,
// holdReason/existingSolutionDetail Show, etc.). See .claude/rules/dev/document-pipeline? no — fields.ts.

import type { FieldDefinitionDto, FieldRuleDto, RuleComparator } from '@shared/types';

/** The sections the S3 create form surfaces, in order (the four numbered sections in the prototype). */
export const INTAKE_CREATE_SECTIONS = ['Intake', 'Value mapping', 'Solution details', 'Triage'] as const;

export type FieldValueMap = Record<string, unknown>;

export interface FieldSectionGroup {
  section: string;
  fields: FieldDefinitionDto[];
}

/** Group visible (non-retired, non-derived-only) fields by section, each ordered by sortOrder. */
export function groupFieldsBySection(fields: FieldDefinitionDto[]): FieldSectionGroup[] {
  const order: string[] = [];
  const bySection = new Map<string, FieldDefinitionDto[]>();

  for (const field of [...fields].sort((left, right) => left.sortOrder - right.sortOrder)) {
    if (field.isRetired) continue;
    const section = field.section ?? 'Other';
    if (!bySection.has(section)) {
      bySection.set(section, []);
      order.push(section);
    }
    bySection.get(section)!.push(field);
  }

  return order.map((section) => ({ section, fields: bySection.get(section)! }));
}

/** Keep only the sections named in `sections`, in that order (drives the S3 create form). */
export function filterSections(groups: FieldSectionGroup[], sections: readonly string[]): FieldSectionGroup[] {
  return sections
    .map((section) => groups.find((group) => group.section === section))
    .filter((group): group is FieldSectionGroup => group !== undefined);
}

function asComparable(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** Evaluate one condition-engine comparator (Phase 1 — value-vs-literal string comparison). */
export function evaluateComparator(
  actual: unknown,
  comparator: RuleComparator,
  compareValue: string | null,
): boolean {
  const left = asComparable(actual);
  const right = compareValue;

  switch (comparator) {
    case 'isSet':
      return left !== null;
    case 'isNotSet':
      return left === null;
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'contains':
      return left !== null && right !== null && left.toLowerCase().includes(right.toLowerCase());
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      if (Number.isNaN(leftNumber) || Number.isNaN(rightNumber)) return false;
      if (comparator === 'gt') return leftNumber > rightNumber;
      if (comparator === 'gte') return leftNumber >= rightNumber;
      if (comparator === 'lt') return leftNumber < rightNumber;
      return leftNumber <= rightNumber;
    }
    default:
      return false;
  }
}

function ruleMatches(rule: FieldRuleDto, values: FieldValueMap): boolean {
  return evaluateComparator(values[rule.whenFieldKey], rule.comparator, rule.compareValue);
}

export interface FieldConditionState {
  /** Field keys hidden by an unmet Show rule, or a met Hide rule. */
  hidden: Set<string>;
  /** Field keys required — base `isRequired` OR a met Require rule. */
  required: Set<string>;
}

/**
 * Resolve which fields are hidden/required given the current values.
 * - A field carrying a `Show` rule is hidden UNLESS at least one Show rule matches.
 * - A `Hide` rule hides the field when it matches.
 * - `isRequired` or any matching `Require` rule marks the field required.
 */
export function evaluateFieldConditions(fields: FieldDefinitionDto[], values: FieldValueMap): FieldConditionState {
  const hidden = new Set<string>();
  const required = new Set<string>();

  for (const field of fields) {
    const showRules = field.rules.filter((rule) => rule.action === 'Show');
    const hideRules = field.rules.filter((rule) => rule.action === 'Hide');
    const requireRules = field.rules.filter((rule) => rule.action === 'Require');

    if (showRules.length > 0 && !showRules.some((rule) => ruleMatches(rule, values))) {
      hidden.add(field.fieldKey);
    }
    if (hideRules.some((rule) => ruleMatches(rule, values))) {
      hidden.add(field.fieldKey);
    }
    if (field.isRequired || requireRules.some((rule) => ruleMatches(rule, values))) {
      required.add(field.fieldKey);
    }
  }

  return { hidden, required };
}

/** Priority Score = Business Value + Efficiency Gain − Level of Effort (BS §3.3). */
export function computePriorityScore(values: FieldValueMap): number {
  const businessValue = Number(values.businessValue ?? 0) || 0;
  const efficiencyGain = Number(values.efficiencyGain ?? 0) || 0;
  const levelOfEffort = Number(values.levelOfEffort ?? 0) || 0;
  return businessValue + efficiencyGain - levelOfEffort;
}

/**
 * Validate a Request form on submit. Returns a field-key → message map (empty = valid).
 * Enforces required fields (base + conditional) and numeric 1–5 bounds where the schema sets them.
 */
export function validateRequestForm(
  fields: FieldDefinitionDto[],
  values: FieldValueMap,
): Record<string, string> {
  const { hidden, required } = evaluateFieldConditions(fields, values);
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (hidden.has(field.fieldKey)) continue;
    const raw = values[field.fieldKey];
    const isEmpty = raw === undefined || raw === null || raw === '';

    if (required.has(field.fieldKey) && isEmpty) {
      errors[field.fieldKey] = `${field.displayName} is required.`;
      continue;
    }

    if (!isEmpty && (field.fieldType === 'Number' || field.fieldType === 'Decimal')) {
      const numeric = Number(raw);
      if (Number.isNaN(numeric)) {
        errors[field.fieldKey] = `${field.displayName} must be a number.`;
      } else if (field.minValue !== null && numeric < field.minValue) {
        errors[field.fieldKey] = `${field.displayName} must be at least ${field.minValue}.`;
      } else if (field.maxValue !== null && numeric > field.maxValue) {
        errors[field.fieldKey] = `${field.displayName} must be at most ${field.maxValue}.`;
      }
    }
  }

  return errors;
}
