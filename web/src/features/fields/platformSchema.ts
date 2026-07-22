// Platform Fields & objects — Objects / Relationships tab data (S34, B2). Read-only reference reads
// behind the platform schema screen: the Global built-in objects and the canonical system-seeded
// relationships every workspace inherits (de-duplicated across workspaces). Both endpoints are
// Platform-admin gated server-side (403 for a non-admin) — the page renders these tabs only for a
// platform admin.

import type { ObjectDefinitionDto, RelationshipDto } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

/** The two Global built-in object types (Request, Task) — read-only reference (S34 Objects). */
export function fetchPlatformObjects(signal?: AbortSignal): Promise<ObjectDefinitionDto[]> {
  return apiFetch<ObjectDefinitionDto[]>('/v1/platform/objects', signal ? { signal } : {});
}

/** The canonical system-seeded relationships, read-only, de-duplicated across workspaces (S34). */
export function fetchPlatformRelationships(signal?: AbortSignal): Promise<RelationshipDto[]> {
  return apiFetch<RelationshipDto[]>('/v1/platform/relationships', signal ? { signal } : {});
}
