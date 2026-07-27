// WorkspacesListPage (S38) — the Platform → Workspaces rich table. Covers the gated populated
// render, loading, error, and the New workspace link target. jest-axe runs on each meaningfully
// different rendered state (web-testing.md).

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';

import type { MeDto, WorkspaceId, WorkspaceListRow } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';
import { fetchMe } from '@/features/users/api';

import { fetchWorkspacesList } from '../api';
import { WorkspacesListPage } from './WorkspacesListPage';

jest.mock('../api');
jest.mock('@/features/users/api');
const mockedList = fetchWorkspacesList as jest.MockedFunction<typeof fetchWorkspacesList>;
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;

const rows: WorkspaceListRow[] = [
  {
    id: '1' as WorkspaceId,
    name: 'AI Solutions',
    kind: 'ai-solutions',
    prefix: 'AIS',
    ownerDisplayName: 'Priya Raman',
    memberCount: 127,
    provisionedAt: '2026-01-01T00:00:00Z',
    isArchived: false,
  },
  {
    id: '2' as WorkspaceId,
    name: 'Tax',
    kind: 'pg-dept',
    prefix: 'TAX',
    ownerDisplayName: null,
    memberCount: 31,
    provisionedAt: '2026-05-14T00:00:00Z',
    isArchived: true,
  },
];

function renderPage(me: MeDto = buildMe({ isPlatformAdmin: true })) {
  mockedFetchMe.mockResolvedValue(me);
  return renderWithProviders(<WorkspacesListPage />, { seedMe: me });
}

beforeEach(() => jest.clearAllMocks());

it('WorkspacesListPage — admin with rows — renders the rich table', async () => {
  // Arrange
  mockedList.mockResolvedValue(rows);

  // Act
  const { container } = renderPage();

  // Assert
  expect(await screen.findByText('AI Solutions')).toBeInTheDocument();
  expect(screen.getByText('Hub')).toBeInTheDocument();
  expect(screen.getByText('PG/Dept')).toBeInTheDocument();
  expect(screen.getByText('Priya Raman')).toBeInTheDocument();
  expect(screen.getByText('Archived')).toBeInTheDocument();
  expect(screen.getByText('Active')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('WorkspacesListPage — loading — shows a status indicator', async () => {
  // Arrange
  let resolveList: (value: WorkspaceListRow[]) => void = () => {};
  mockedList.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveList = resolve;
      }),
  );

  // Act
  const { container } = renderPage();

  // Assert
  expect(await screen.findByRole('status')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();

  // Cleanup — resolve so the pending promise doesn't leak into the next test
  resolveList([]);
  await waitFor(() => expect(mockedList).toHaveBeenCalled());
});

it('WorkspacesListPage — error — shows a retryable alert', async () => {
  // Arrange
  mockedList.mockRejectedValue(new Error('boom'));

  // Act
  const { container } = renderPage();

  // Assert
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('WorkspacesListPage — New workspace button — links to the wizard', async () => {
  // Arrange
  mockedList.mockResolvedValue(rows);

  // Act
  renderPage();
  const link = await screen.findByRole('link', { name: /new workspace/i });

  // Assert
  expect(link).toHaveAttribute('href', '/platform/workspaces/new');
});
