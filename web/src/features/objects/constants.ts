// Typed module-level constants for the Objects tab (S30) — never inline JSX for a rendered list
// (web-component-architecture.md).

import type { ObjectLocation } from '@shared/types';

/** Location options for the editor Select and the Location funnel. Local Workspace leads (the default). */
export const LOCATION_OPTIONS: readonly { value: ObjectLocation; label: string }[] = [
  { value: 'LocalWorkspace', label: 'Local Workspace' },
  { value: 'Global', label: 'Global' },
];

export function locationLabel(location: string): string {
  return LOCATION_OPTIONS.find((option) => option.value === location)?.label ?? location;
}

/** Built-in sidebar categories offered when a custom object is shown in the left sidebar. */
export const BASE_SIDEBAR_CATEGORIES: readonly string[] = [
  'Workspace',
  'Reference',
  'Admin',
  'Objects',
];

/** Sentinel select value that reveals the "new category" text input. */
export const NEW_CATEGORY_VALUE = '__new__';

/** Fallback category when none is chosen. */
export const DEFAULT_SIDEBAR_CATEGORY = 'Objects';
