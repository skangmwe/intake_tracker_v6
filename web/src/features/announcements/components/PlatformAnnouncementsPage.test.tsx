// Tests for PlatformAnnouncementsPage — the platform-admin broadcast surface. Covers the non-admin gate,
// the empty / list states, the grouped "All workspaces" summary, the create-to-all flow, the edit-open,
// and the retire confirm. useMe is seeded (isPlatformAdmin), the platform api is mocked. axe on the empty +
// list states.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { PlatformAnnouncementRow, PlatformWorkspaceDto, WorkspaceId } from '@shared/types';

import { fetchMe } from '@/features/users/api';
import { buildMe, renderWithProviders } from '@/test-utils';

import * as platformApi from '../platformApi';
import { PlatformAnnouncementsPage } from './PlatformAnnouncementsPage';

expect.extend(toHaveNoViolations);
jest.mock('../platformApi');
// The platform gate reads GET /users/me; mock it so the seeded query's refetch resolves (rather than
// erroring on the unmocked network) and the gate stays on the admin surface.
jest.mock('@/features/users/api');
const mockedApi = platformApi as jest.Mocked<typeof platformApi>;
const mockedFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;

const ADMIN_ME = buildMe({ isPlatformAdmin: true });
const NON_ADMIN_ME = buildMe({ isPlatformAdmin: false });

const WORKSPACES: PlatformWorkspaceDto[] = [
  { id: 'ws-1' as WorkspaceId, name: 'AI Solutions', kind: 'ai-solutions' },
  { id: 'ws-2' as WorkspaceId, name: 'Litigation', kind: 'pg-dept' },
];

function row(overrides: Partial<PlatformAnnouncementRow> = {}): PlatformAnnouncementRow {
  return {
    broadcastId: 'b1',
    title: 'Firm-wide notice',
    body: 'Body',
    pinned: false,
    status: 'Active',
    author: 'u1' as PlatformAnnouncementRow['author'],
    authorName: 'Platform Admin',
    postedAt: '2026-07-05T09:31:00Z',
    workspaceCount: 2,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedFetchMe.mockResolvedValue(ADMIN_ME);
  mockedApi.fetchPlatformWorkspaces.mockResolvedValue(WORKSPACES);
  mockedApi.queryPlatformAnnouncements.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 100 });
});

it('PlatformAnnouncementsPage — non-admin — shows the platform gate message', async () => {
  // Arrange
  mockedFetchMe.mockResolvedValue(NON_ADMIN_ME);

  // Act
  renderWithProviders(<PlatformAnnouncementsPage />, { seedMe: NON_ADMIN_ME });

  // Assert
  expect(await screen.findByText(/available to platform admins/i)).toBeInTheDocument();
});

it('PlatformAnnouncementsPage — empty — shows the zero-data state', async () => {
  // Act
  const { container } = renderWithProviders(<PlatformAnnouncementsPage />, { seedMe: ADMIN_ME });

  // Assert
  expect(await screen.findByText('No broadcasts yet')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('PlatformAnnouncementsPage — with a broadcast to every workspace — shows "All workspaces"', async () => {
  // Arrange
  mockedApi.queryPlatformAnnouncements.mockResolvedValue({
    items: [row()],
    totalCount: 1,
    page: 1,
    pageSize: 100,
  });

  // Act
  const { container } = renderWithProviders(<PlatformAnnouncementsPage />, { seedMe: ADMIN_ME });

  // Assert
  await screen.findByText('Firm-wide notice');
  expect(screen.getByText('All workspaces')).toBeInTheDocument();
  expect(screen.getByText('Active')).toBeInTheDocument();
  expect(screen.getByText('1–1 of 1 broadcasts')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('PlatformAnnouncementsPage — a broadcast to a subset — shows the workspace count', async () => {
  // Arrange
  mockedApi.queryPlatformAnnouncements.mockResolvedValue({
    items: [row({ workspaceCount: 1 })],
    totalCount: 1,
    page: 1,
    pageSize: 100,
  });

  // Act
  renderWithProviders(<PlatformAnnouncementsPage />, { seedMe: ADMIN_ME });

  // Assert
  await screen.findByText('Firm-wide notice');
  expect(screen.getByText('1 workspace')).toBeInTheDocument();
});

it('PlatformAnnouncementsPage — create flow — posts a broadcast to all workspaces', async () => {
  // Arrange
  mockedApi.createPlatformBroadcast.mockResolvedValue({ broadcastId: 'b2', workspaceCount: 2 });
  const user = userEvent.setup();

  // Act
  renderWithProviders(<PlatformAnnouncementsPage />, { seedMe: ADMIN_ME });
  await screen.findByText('No broadcasts yet');
  await user.click(screen.getByRole('button', { name: 'New broadcast' }));
  await user.type(await screen.findByLabelText('Title'), 'Fresh notice');
  await user.type(screen.getByLabelText('Body'), 'Body text');
  await user.click(screen.getByRole('button', { name: 'Post' }));

  // Assert
  await waitFor(() =>
    expect(mockedApi.createPlatformBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Fresh notice',
        body: 'Body text',
        target: { kind: 'all' },
      }),
    ),
  );
});

it('PlatformAnnouncementsPage — retire flow — opens the row and archives every copy', async () => {
  // Arrange
  mockedApi.queryPlatformAnnouncements.mockResolvedValue({
    items: [row()],
    totalCount: 1,
    page: 1,
    pageSize: 100,
  });
  mockedApi.retirePlatformBroadcast.mockResolvedValue(undefined);
  const user = userEvent.setup();

  // Act
  renderWithProviders(<PlatformAnnouncementsPage />, { seedMe: ADMIN_ME });
  await user.click(await screen.findByText('Firm-wide notice'));
  await user.click(await screen.findByRole('button', { name: 'Retire now' }));
  await user.click(await screen.findByRole('button', { name: 'Retire broadcast' }));

  // Assert
  await waitFor(() => expect(mockedApi.retirePlatformBroadcast).toHaveBeenCalledWith('b1'));
});
