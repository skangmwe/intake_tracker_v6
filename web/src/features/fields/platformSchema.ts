// Platform Fields & objects — Objects / Relationships tab data (S34, B2). Read-only reference reads
// behind the platform schema screen: the Global built-in objects, the firm-wide workspace picker,
// and one workspace's relationships. Every endpoint is Platform-admin gated server-side (403 for a
// non-admin) — the page renders these tabs only for a platform admin.

import type {
  ObjectDefinitionDto,
  PlatformWorkspaceDto,
  RelationshipDto,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';
import { withQuery } from '@/shared/http/url';

/** The two Global built-in object types (Request, Task) — read-only reference (S34 Objects). */
export function fetchPlatformObjects(signal?: AbortSignal): Promise<ObjectDefinitionDto[]> {
  return apiFetch<ObjectDefinitionDto[]>('/v1/platform/objects', signal ? { signal } : {});
}

/** Every workspace, firm-wide — the picker for the S34 Relationships tab. */
export function fetchPlatformWorkspaces(signal?: AbortSignal): Promise<PlatformWorkspaceDto[]> {
  return apiFetch<PlatformWorkspaceDto[]>('/v1/platform/workspaces', signal ? { signal } : {});
}

/** One workspace's relationships — read-only reference (S34 Relationships). */
export function fetchPlatformRelationships(
  workspaceId: WorkspaceId,
  signal?: AbortSignal,
): Promise<RelationshipDto[]> {
  return apiFetch<RelationshipDto[]>(
    withQuery('/v1/platform/relationships', { workspaceId }),
    signal ? { signal } : {},
  );
}
