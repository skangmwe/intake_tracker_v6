// Typed module-level constants for the Objects tab (S30) — never inline JSX for a rendered list
// (web-component-architecture.md).

import type { ObjectLocation } from '@shared/types';

/**
 * Full set of Location values an object can display as. Used for the read-only display label and
 * the Location funnel — a platform-owned Global object still appears (read-only) in a workspace's
 * object list and must still label and filter as "Global". This list is NOT the authoring list; see
 * `WORKSPACE_ONLY_LOCATION` for what a workspace may actually set.
 */
export const LOCATION_OPTIONS: readonly { value: ObjectLocation; label: string }[] = [
  { value: 'LocalWorkspace', label: 'Local Workspace' },
  { value: 'Global', label: 'Global' },
];

/**
 * The one Location a workspace may author. "Global" means platform-owned (WorkspaceId IS NULL) —
 * only platform admins create Global objects (via the Platform schema surface), never a
 * workspace's own object editor.
 */
export const WORKSPACE_ONLY_LOCATION: ObjectLocation = 'LocalWorkspace';

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
