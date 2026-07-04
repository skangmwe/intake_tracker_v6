// Unit tests for the active-workspace resolver (no React, no network).

import type { WorkspaceId } from '@shared/types';

import { resolveActiveWorkspaceId } from './workspace';

interface Membership {
  workspaceId: WorkspaceId;
  workspaceKind: string;
}

function membership(id: string, kind: string): Membership {
  return { workspaceId: id as WorkspaceId, workspaceKind: kind };
}

describe('resolveActiveWorkspaceId', () => {
  it('resolveActiveWorkspaceId — undefined memberships — returns null', () => {
    // Arrange / Act / Assert
    expect(resolveActiveWorkspaceId(undefined)).toBeNull();
  });

  it('resolveActiveWorkspaceId — empty memberships — returns null', () => {
    // Arrange / Act / Assert
    expect(resolveActiveWorkspaceId([])).toBeNull();
  });

  it('resolveActiveWorkspaceId — prefers the ai-solutions workspace over others', () => {
    // Arrange
    const memberships = [membership('ws-dept', 'department'), membership('ws-ai', 'ai-solutions')];

    // Act
    const result = resolveActiveWorkspaceId(memberships);

    // Assert
    expect(result).toBe('ws-ai');
  });

  it('resolveActiveWorkspaceId — no ai-solutions membership — falls back to the first', () => {
    // Arrange
    const memberships = [membership('ws-dept', 'department'), membership('ws-pg', 'practice-group')];

    // Act
    const result = resolveActiveWorkspaceId(memberships);

    // Assert
    expect(result).toBe('ws-dept');
  });
});
