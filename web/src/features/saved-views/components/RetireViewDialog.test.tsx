// Tests for RetireViewDialog — the confirm/cancel flow, the shared vs personal copy branch, and the
// inline error branch. jest-axe on the open modal (focus-trapped dialog state).

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { SavedViewDto, SavedViewId, UserId, WorkspaceId } from '@shared/types';

import { ApiError } from '@/shared/http/apiClient';

import { RetireViewDialog } from './RetireViewDialog';

function buildView(overrides: Partial<SavedViewDto> = {}): SavedViewDto {
  return {
    id: 'view-1' as SavedViewId,
    workspaceId: 'ws-1' as WorkspaceId,
    objectType: 'Request',
    name: 'My open requests',
    scope: 'personal',
    isDefault: false,
    columns: [],
    filters: {},
    sort: [],
    ownerUserId: 'user-1' as UserId,
    createdBy: 'user-1' as UserId,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function setup(overrides: Partial<Parameters<typeof RetireViewDialog>[0]> = {}) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const view = render(
    <RetireViewDialog
      view={buildView()}
      onConfirm={onConfirm}
      onCancel={onCancel}
      isPending={false}
      error={null}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel, ...view };
}

it('RetireViewDialog — names the view and confirms', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onConfirm, container } = setup();

  // Assert — open dialog, accessible
  expect(screen.getByRole('dialog')).toHaveTextContent(/retire this view/i);
  expect(await axe(container)).toHaveNoViolations();

  // Act
  await user.click(screen.getByRole('button', { name: /retire my open requests/i }));

  // Assert
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it('RetireViewDialog — cancel calls back', async () => {
  // Arrange
  const user = userEvent.setup();
  const { onCancel } = setup();

  // Act
  await user.click(screen.getByRole('button', { name: /^cancel$/i }));

  // Assert
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it('RetireViewDialog — shared view uses "shared" copy', () => {
  // Arrange
  setup({ view: buildView({ scope: 'shared', name: 'Team backlog' }) });

  // Assert
  expect(screen.getByRole('dialog')).toHaveTextContent(/from the shared view list/i);
});

it('RetireViewDialog — pending disables the actions and shows progress copy', () => {
  // Arrange
  setup({ isPending: true });

  // Assert
  expect(screen.getByRole('button', { name: /retiring/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled();
});

it('RetireViewDialog — error branch renders an inline alert', () => {
  // Arrange
  const error = new ApiError(409, {
    type: 'https://mws.ai/errors/conflict',
    title: 'Conflict',
    status: 409,
    detail: 'This view is in use.',
  });

  // Act
  setup({ error });

  // Assert
  expect(screen.getByRole('alert')).toHaveTextContent(/this view is in use/i);
});
