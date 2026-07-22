// Import column-mapping helpers (S28 import wizard). Pure functions shared by the mapping table (row
// warnings) and the wizard (the Next-step gate + the payload sent to the API), so both agree on what a
// valid mapping is. A ColumnMapping keys each CSV column index to a target field key ('' = don't
// import). No React, no IO — unit-tested directly.

import type { ImportColumnMapping, IoFieldSpec } from '@shared/types';

/** columnIndex → target field key ('' means the column is not imported). */
export type ColumnMapping = Record<number, string>;

/** Lower-case + strip non-alphanumerics so header spelling/spacing doesn't matter (mirrors the server). */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Suggest a mapping by matching each header to a field's key or label (case/spacing-insensitive). The
 * first header to claim a field wins; unmatched columns map to '' (don't import). */
export function autoMapColumns(headers: string[], fields: IoFieldSpec[]): ColumnMapping {
  const byNormalised = new Map<string, string>();
  for (const field of fields) {
    byNormalised.set(normalise(field.key), field.key);
    byNormalised.set(normalise(field.label), field.key);
  }

  const mapping: ColumnMapping = {};
  const claimed = new Set<string>();
  headers.forEach((header, index) => {
    const match = byNormalised.get(normalise(header));
    if (match && !claimed.has(match)) {
      mapping[index] = match;
      claimed.add(match);
    } else {
      mapping[index] = '';
    }
  });
  return mapping;
}

/** Field keys mapped by more than one column (a mapping error — one field, one source column). */
export function duplicateFieldKeys(mapping: ColumnMapping): Set<string> {
  const counts = new Map<string, number>();
  for (const key of Object.values(mapping)) {
    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

export interface MappingValidity {
  valid: boolean;
  /** Required fields not mapped to any column. */
  missingRequired: IoFieldSpec[];
  /** Field keys mapped by more than one column. */
  duplicates: Set<string>;
  /** At least one column is mapped to a field. */
  hasAnyMapping: boolean;
}

/** Validate a mapping: at least one mapped column, no duplicate targets, every required field mapped. */
export function validateMapping(mapping: ColumnMapping, fields: IoFieldSpec[]): MappingValidity {
  const mappedKeys = new Set(Object.values(mapping).filter(Boolean));
  const duplicates = duplicateFieldKeys(mapping);
  const missingRequired = fields.filter(
    (field) => field.required === true && !mappedKeys.has(field.key),
  );
  const hasAnyMapping = mappedKeys.size > 0;
  return {
    valid: hasAnyMapping && duplicates.size === 0 && missingRequired.length === 0,
    missingRequired,
    duplicates,
    hasAnyMapping,
  };
}

/** Convert a ColumnMapping to the API payload, dropping unmapped columns. */
export function toMappingPayload(mapping: ColumnMapping): ImportColumnMapping[] {
  return Object.entries(mapping)
    .filter(([, fieldKey]) => fieldKey)
    .map(([columnIndex, fieldKey]) => ({ columnIndex: Number(columnIndex), fieldKey }));
}
