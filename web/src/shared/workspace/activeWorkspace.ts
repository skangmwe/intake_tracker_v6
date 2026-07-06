// Resolve the caller's active workspace from their memberships. Prefers the AI Solutions hub when
// the user belongs to it, else the first membership. Returns null when the user has none.
//
// Shared across features (Requests, Feature Catalog, Search) — extracted here from the requests
// feature once a third consumer appeared (web-file-structure.md: utils used by 2+ features live in
// shared/, not inside a feature).

import type { WorkspaceId } from '@shared/types';

interface MembershipLike {
  workspaceId: WorkspaceId;
  workspaceKind: string;
}

export function resolveActiveWorkspaceId(memberships: readonly MembershipLike[] | undefined): WorkspaceId | null {
  if (!memberships || memberships.length === 0) return null;
  const chosen = memberships.find((membership) => membership.workspaceKind === 'ai-solutions') ?? memberships[0];
  return chosen ? chosen.workspaceId : null;
}
