// useRelationshipTabs — the hook backing the S4/S5 config-driven tab bar.
// Given a record's workspace and object type, returns the relationship-driven tabs to
// render (relationships where ShowOnFromAsTab = 1 and the FromObjectType matches). The
// hook filters out retired rows and sorts by SortOrder — system-seeded rows (IsSystem = 1)
// appear alongside admin-authored ones.
//
// Consumers: shared/RelationshipsSidePanel (records-side), features/requests/RecordDetailPage
// (tab bar).

import { useEffect, useState } from 'react';

import type { FieldObjectType, RelationshipDto, WorkspaceId } from '@shared/types';

import { fetchRelationships } from './api';

export interface RelationshipTab {
  relationshipId: RelationshipDto['id'];
  tabLabel: string;
  toObjectType: FieldObjectType;
  isSystem: boolean;
}

export interface UseRelationshipTabsResult {
  tabs: RelationshipTab[];
  relationships: RelationshipDto[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Loads relationship definitions for the workspace and computes which render as tabs on
 * the current record's From-side detail. Handles unmount cancellation via AbortController.
 */
export function useRelationshipTabs(
  workspaceId: WorkspaceId | null,
  fromObjectType: FieldObjectType | null,
): UseRelationshipTabsResult {
  const [relationships, setRelationships] = useState<RelationshipDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !fromObjectType) {
      setRelationships([]);
      return undefined;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetchRelationships(workspaceId, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setRelationships(rows);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Failed to load relationships.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [workspaceId, fromObjectType]);

  const tabs = relationships
    .filter((relationship) =>
      relationship.showOnFromAsTab &&
      !relationship.isRetired &&
      relationship.fromObjectType === fromObjectType,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map<RelationshipTab>((relationship) => ({
      relationshipId: relationship.id,
      tabLabel: relationship.tabLabel ?? relationship.fromSideLabel,
      toObjectType: relationship.toObjectType,
      isSystem: relationship.isSystem,
    }));

  return { tabs, relationships, isLoading, error };
}
