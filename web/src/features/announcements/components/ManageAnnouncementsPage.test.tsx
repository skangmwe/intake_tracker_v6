// Tests for ManageAnnouncementsPage (S23) — the admin authoring surface reconciled to the prototype
// table + modal. Covers the no-access state, the zero-data empty state, the table render, the create
// flow (Add), the row-open edit flow (Save changes), and the funnel filtered-to-zero state. jest-axe on
// the empty + table states. useMe is seeded; the announcements api and the members hook are mocked.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type {
  AnnouncementDto,
  AnnouncementListRow,
  PaginatedResponse,
  UserId,
  WorkspaceId,
} from '@shared/types';

import { buildMe, buildMembership, renderWithProviders } from '@/test-utils';

import * as api from '../api';
import { ManageAnnouncementsPage } from './ManageAnnouncementsPage';

expect.extend(toHaveNoViolations);
jest.mock('../api');

// The members hook drives the "Posted by" options — stub it so the page renders without a members fetch.
jest.mock('@/features/users/useMembers', () => ({
  useMembers: () => ({
    data: {
      members: [
        {
          userId: '00000000-0000-0000-0000-000000000001',
          displayName: 'Priya Raman',
          email: 'priya@mws.ai',
          status: 'Active',
        },
        { userId: 'u2', displayName: 'S. Boyd', email: 'boyd@mws.ai', status: 'Active' },
      ],
    },
  }),
}));

const mockedApi = api as jest.Mocked<typeof api>;

const ADMIN_ME = buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] });
const MEMBER_ME = buildMe({ memberships: [buildMembership({ level: 'Member' })] });

function row(overrides: Partial<AnnouncementListRow> = {}): AnnouncementListRow {
  return {
    id: 'a1' as AnnouncementListRow['id'],
    title: 'Coverage news',
    bodySnippet: 'Preview',
    pinned: false,
    status: 'Active',
    author: 'u1' as AnnouncementListRow['author'],
    authorName: 'S. Boyd',
    postedAt: '2026-07-05T09:31:00Z',
    ...overrides,
  };
}

function page(items: AnnouncementListRow[]): PaginatedResponse<AnnouncementListRow> {
  return { items, totalCount: items.length, page: 1, pageSize: 100 };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.queryManagedAnnouncements.mockResolvedValue(page([]));
});

it('ManageAnnouncementsPage — non-admin — shows the no-access message', async () => {
  // Act
  renderWithProviders(<ManageAnnouncementsPage />, { seedMe: MEMBER_ME });

  // Assert
  expect(await screen.findByText(/You need to be a workspace admin/)).toBeInTheDocument();
});

it('ManageAnnouncementsPage — empty — shows the zero-data state', async () => {
  // Act
  const { container } = renderWithProviders(<ManageAnnouncementsPage />, { seedMe: ADMIN_ME });

  // Assert
  expect(await screen.findByText('No announcements yet')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('ManageAnnouncementsPage — with rows — renders the table with a status pill and count footer', async () => {
  // Arrange
  mockedApi.queryManagedAnnouncements.mockResolvedValue(page([row()]));

  // Act
  const { container } = renderWithProviders(<ManageAnnouncementsPage />, { seedMe: ADMIN_ME });

  // Assert
  await screen.findByText('Coverage news');
  expect(screen.getByText('Active')).toBeInTheDocument();
  expect(screen.getByText('1–1 of 1 announcements')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('ManageAnnouncementsPage — create flow — opens the editor and creates a workspace-wide announcement', async () => {
  // Arrange
  mockedApi.createAnnouncement.mockResolvedValue(row() as never);
  const user = userEvent.setup();

  // Act
  renderWithProviders(<ManageAnnouncementsPage />, { seedMe: ADMIN_ME });
  await screen.findByText('No announcements yet');
  await user.click(screen.getByRole('button', { name: 'New announcement' }));
  await user.type(await screen.findByLabelText('Title'), 'Fresh notice');
  await user.type(screen.getByLabelText('Body'), 'Body text');
  await user.click(screen.getByRole('button', { name: 'Add' }));

  // Assert
  await waitFor(() =>
    expect(mockedApi.createAnnouncement).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        title: 'Fresh notice',
        body: 'Body text',
        audience: { kind: 'everyone' },
        status: 'Active',
      }),
    ),
  );
});

it('ManageAnnouncementsPage — edit flow — opens the row, prefills, and updates', async () => {
  // Arrange — the row opens the editor, which loads the full detail via fetchAnnouncement.
  const detail: AnnouncementDto = {
    id: 'a1' as AnnouncementDto['id'],
    workspaceId: 'ws-1' as WorkspaceId,
    title: 'Coverage news',
    body: 'Existing body',
    audience: { kind: 'everyone' },
    pinned: false,
    status: 'Active',
    author: 'u2' as UserId,
    createdAt: '2026-07-05T10:00:00Z',
    updatedAt: '2026-07-05T10:00:00Z',
    publishedAt: '2026-07-05T10:00:00Z',
    autoArchive: true,
  };
  mockedApi.queryManagedAnnouncements.mockResolvedValue(page([row()]));
  mockedApi.fetchAnnouncement.mockResolvedValue(detail);
  mockedApi.updateAnnouncement.mockResolvedValue(detail as never);
  const user = userEvent.setup();

  // Act
  renderWithProviders(<ManageAnnouncementsPage />, { seedMe: ADMIN_ME });
  await user.click(await screen.findByText('Coverage news'));
  const titleField = await screen.findByLabelText('Title');
  expect(titleField).toHaveValue('Coverage news');
  await user.clear(titleField);
  await user.type(titleField, 'Updated title');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));

  // Assert
  await waitFor(() =>
    expect(mockedApi.updateAnnouncement).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ title: 'Updated title', audience: { kind: 'everyone' } }),
    ),
  );
});

it('ManageAnnouncementsPage — filter with no match — shows the filtered-to-zero state', async () => {
  // Arrange
  mockedApi.queryManagedAnnouncements.mockResolvedValue(page([row()]));
  const user = userEvent.setup();

  // Act
  renderWithProviders(<ManageAnnouncementsPage />, { seedMe: ADMIN_ME });
  await screen.findByText('Coverage news');
  await user.click(screen.getByRole('button', { name: 'Filter Announcement' }));
  await user.type(screen.getByPlaceholderText('contains…'), 'zzz');

  // Assert
  expect(await screen.findByText('No announcements match your filter')).toBeInTheDocument();
});
