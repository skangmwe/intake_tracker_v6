// Tests for SavedViewsSection — the loading / error / empty / rows states, the scope + default
// badges, and the three actions (make-shared, toggle-default, retire-with-confirm). The saved-view
// hooks are mocked so each state is controllable. jest-axe runs on every meaningfully different
// rendered state, including the open retire modal (web/CLAUDE.md).

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { SavedViewDto, SavedViewId, UserId, WorkspaceId } from '@shared/types';

import * as hooks from '../useSavedViews';
import { SavedViewsSection } from './SavedViewsSection';

jest.mock('../useSavedViews');
const mocked = hooks as jest.Mocked<typeof hooks>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;

function buildView(overrides: Partial<SavedViewDto> = {}): SavedViewDto {
  return {
    id: 'view-1' as SavedViewId,
    workspaceId: WORKSPACE_ID,
    objectType: 'Request',
    name: 'My open requests',
    scope: 'personal',
    isDefault: false,
    columns: ['id', 'name'],
    filters: {},
    sort: [],
    ownerUserId: 'user-1' as UserId,
    createdBy: 'user-1' as UserId,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

type ListResult = ReturnType<typeof hooks.useSavedViews>;
type UpdateResult = ReturnType<typeof hooks.useUpdateSavedView>;
type DeleteResult = ReturnType<typeof hooks.useDeleteSavedView>;

const updateMutate = jest.fn();
const deleteMutate = jest.fn();
const deleteReset = jest.fn();

function mockList(result: Partial<ListResult>) {
  mocked.useSavedViews.mockReturnValue({ data: undefined, isLoading: false, isError: false, ...result } as ListResult);
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.useUpdateSavedView.mockReturnValue({
    mutate: updateMutate,
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
  } as unknown as UpdateResult);
  mocked.useDeleteSavedView.mockReturnValue({
    mutate: deleteMutate,
    isPending: false,
    isError: false,
    error: null,
    reset: deleteReset,
  } as unknown as DeleteResult);
});

function renderSection() {
  return render(<SavedViewsSection workspaceId={WORKSPACE_ID} objectType="Request" />);
}

it('SavedViewsSection — loading — shows a status message', async () => {
  // Arrange
  mockList({ isLoading: true });

  // Act
  const { container } = renderSection();

  // Assert
  expect(screen.getByRole('status')).toHaveTextContent(/loading views/i);
  expect(await axe(container)).toHaveNoViolations();
});

it('SavedViewsSection — error — shows an error alert', async () => {
  // Arrange
  mockList({ isError: true });

  // Act
  const { container } = renderSection();

  // Assert
  expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i);
  expect(await axe(container)).toHaveNoViolations();
});

it('SavedViewsSection — empty — shows the empty note', async () => {
  // Arrange
  mockList({ data: [] });

  // Act
  const { container } = renderSection();

  // Assert
  expect(screen.getByText(/no shared or personal views/i)).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('SavedViewsSection — rows — renders scope + default badges', async () => {
  // Arrange — one shared default, one personal.
  mockList({ data: [buildView({ id: 'v2' as SavedViewId, name: 'Team backlog', scope: 'shared', isDefault: true }), buildView()] });

  // Act
  const { container } = renderSection();

  // Assert — the "Default" badge is a pill, distinct from the "Default" column header.
  expect(screen.getByText('Shared')).toBeInTheDocument();
  expect(screen.getByText('Personal')).toBeInTheDocument();
  expect(screen.getByText('Default', { selector: '.mws-badge' })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('SavedViewsSection — make shared — updates the personal view to shared scope', async () => {
  // Arrange
  const user = userEvent.setup();
  mockList({ data: [buildView()] });
  renderSection();

  // Act
  await user.click(screen.getByRole('button', { name: /make shared/i }));

  // Assert
  expect(updateMutate).toHaveBeenCalledWith(
    expect.objectContaining({ savedViewId: 'view-1', request: expect.objectContaining({ scope: 'shared' }) }),
  );
});

it('SavedViewsSection — set as default — flips isDefault', async () => {
  // Arrange
  const user = userEvent.setup();
  mockList({ data: [buildView({ isDefault: false })] });
  renderSection();

  // Act
  await user.click(screen.getByRole('button', { name: /set as default/i }));

  // Assert
  expect(updateMutate).toHaveBeenCalledWith(
    expect.objectContaining({ request: expect.objectContaining({ isDefault: true }) }),
  );
});

it('SavedViewsSection — retire — opens a confirm modal and deletes on confirm', async () => {
  // Arrange
  const user = userEvent.setup();
  mockList({ data: [buildView()] });
  const { container } = renderSection();

  // Act — open the confirm
  await user.click(screen.getByRole('button', { name: /^retire$/i }));

  // Assert — modal open, still accessible
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent(/retire this view/i);
  expect(await axe(container)).toHaveNoViolations();

  // Act — confirm
  await user.click(screen.getByRole('button', { name: /retire my open requests/i }));

  // Assert
  expect(deleteMutate).toHaveBeenCalledWith('view-1', expect.anything());
});
