// App-wide active-workspace selection. The top-left switcher sets it; every workspace-scoped
// surface reads it via useActiveWorkspaceId(). The choice persists to localStorage and is validated
// against the caller's current memberships — an unknown/stale id falls back to the default
// (resolveActiveWorkspaceId: the ai-solutions hub, else the first workspace). The pg-dept-template is
// a clone source, never a workspace you work in, so it is excluded from the switchable set.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { WorkspaceId } from '@shared/types';

import { useMe } from '@/features/users/useMe';
import { resolveActiveWorkspaceId } from './activeWorkspace';

export const ACTIVE_WORKSPACE_STORAGE_KEY = 'ast.active-workspace';

interface ActiveWorkspaceValue {
  activeWorkspaceId: WorkspaceId | null;
  setActiveWorkspaceId: (id: WorkspaceId) => void;
}

const ActiveWorkspaceContext = createContext<ActiveWorkspaceValue | null>(null);

function readStoredWorkspaceId(): WorkspaceId | null {
  try {
    const value = localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    return value ? (value as WorkspaceId) : null;
  } catch {
    return null;
  }
}

function writeStoredWorkspaceId(id: WorkspaceId): void {
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, id);
  } catch {
    // Storage unavailable — the selection still applies for this session.
  }
}

export function ActiveWorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const [storedId, setStoredId] = useState<WorkspaceId | null>(readStoredWorkspaceId);

  // Switchable memberships only — the template is a clone source, never a workspace you work in.
  const switchable = useMemo(
    () => (me?.memberships ?? []).filter((membership) => membership.workspaceKind !== 'pg-dept-template'),
    [me],
  );

  const activeWorkspaceId = useMemo<WorkspaceId | null>(() => {
    const stored = storedId && switchable.some((membership) => membership.workspaceId === storedId)
      ? storedId
      : null;
    return stored ?? resolveActiveWorkspaceId(switchable);
  }, [storedId, switchable]);

  const setActiveWorkspaceId = useCallback((id: WorkspaceId) => {
    setStoredId(id);
    writeStoredWorkspaceId(id);
  }, []);

  const value = useMemo<ActiveWorkspaceValue>(
    () => ({ activeWorkspaceId, setActiveWorkspaceId }),
    [activeWorkspaceId, setActiveWorkspaceId],
  );

  return <ActiveWorkspaceContext.Provider value={value}>{children}</ActiveWorkspaceContext.Provider>;
}

export function useActiveWorkspace(): ActiveWorkspaceValue {
  const value = useContext(ActiveWorkspaceContext);
  if (!value) {
    throw new Error('useActiveWorkspace must be used within an ActiveWorkspaceProvider');
  }
  return value;
}

export function useActiveWorkspaceId(): WorkspaceId | null {
  return useActiveWorkspace().activeWorkspaceId;
}
