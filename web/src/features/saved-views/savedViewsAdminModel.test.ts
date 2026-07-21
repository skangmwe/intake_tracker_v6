// Tests for toUpsertRequest — the full-replace request the PATCH endpoint needs is rebuilt from a
// view, and an override changes only the named field while carrying the rest through.

import type { SavedViewDto, SavedViewId, UserId, WorkspaceId } from '@shared/types';

import { toUpsertRequest } from './savedViewsAdminModel';

function buildView(overrides: Partial<SavedViewDto> = {}): SavedViewDto {
  return {
    id: 'view-1' as SavedViewId,
    workspaceId: 'ws-1' as WorkspaceId,
    objectType: 'Request',
    name: 'My open requests',
    scope: 'personal',
    isDefault: false,
    columns: ['id', 'name', 'stage'],
    filters: { stage: { kind: 'select', values: ['execution'] } },
    sort: [{ column: 'due', direction: 'asc' }],
    ownerUserId: 'user-1' as UserId,
    createdBy: 'user-1' as UserId,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

it('toUpsertRequest — no override — carries the definition through unchanged', () => {
  // Arrange
  const view = buildView();

  // Act
  const request = toUpsertRequest(view);

  // Assert
  expect(request).toEqual({
    objectType: 'Request',
    name: 'My open requests',
    scope: 'personal',
    isDefault: false,
    columns: ['id', 'name', 'stage'],
    filters: { stage: { kind: 'select', values: ['execution'] } },
    sort: [{ column: 'due', direction: 'asc' }],
  });
});

it('toUpsertRequest — scope override — promotes to shared, keeps the rest', () => {
  // Act
  const request = toUpsertRequest(buildView(), { scope: 'shared' });

  // Assert
  expect(request.scope).toBe('shared');
  expect(request.name).toBe('My open requests');
  expect(request.columns).toEqual(['id', 'name', 'stage']);
});

it('toUpsertRequest — default override — flips isDefault only', () => {
  // Act
  const request = toUpsertRequest(buildView({ isDefault: false }), { isDefault: true });

  // Assert
  expect(request.isDefault).toBe(true);
  expect(request.scope).toBe('personal');
});
