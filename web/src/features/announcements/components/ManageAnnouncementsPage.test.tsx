// Tests for ManageAnnouncementsPage (S23) — the admin authoring surface. Covers the no-access state,
// the empty state, the row list with publish/retire actions, and the create flow. jest-axe on the
// empty + list states. useMe is seeded; the feature api is mocked.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { AnnouncementDto, AnnouncementListRow, PaginatedResponse, UserId, WorkspaceId } from '@shared/types';

import { buildMe, buildMembership, renderWithProviders } from '@/test-utils';

import * as api from '../api';
import { ManageAnnouncementsPage } from './ManageAnnouncementsPage';

expect.extend(toHaveNoViolations);
jest.mock('../api');

const mockedApi = api as jest.Mocked<typeof api>;

const ADMIN_ME = buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] });
const MEMBER_ME = buildMe({ memberships: [buildMembership({ level: 'Member' })] });

function row(overrides: Partial<AnnouncementListRow> = {}): AnnouncementListRow {
  return {
    id: 'a1' as AnnouncementListRow['id'],
    title: 'Coverage news',
    bodySnippet: 'Preview',
    pinned: false,
    status: 'Draft',
    author: 'u1' as AnnouncementListRow['author'],
    ...overrides,
  };
}

function page(items: AnnouncementListRow[]): PaginatedResponse<AnnouncementListRow> {
  return { items, totalCount: items.length, page: 1, pageSize: 20 };
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

it('ManageAnnouncementsPage — with a draft — publish action calls the api', async () => {
  // Arrange
  mockedApi.queryManagedAnnouncements.mockResolvedValue(page([row()]));
  mockedApi.publishAnnouncement.mockResolvedValue({ ...row(), status: 'Published' } as never);
  const user = userEvent.setup();

  // Act
  const { container } = renderWithProviders(<ManageAnnouncementsPage />, { seedMe: ADMIN_ME });
  await screen.findByText('Coverage news');
  expect(await axe(container)).toHaveNoViolations();
  await user.click(screen.getByRole('button', { name: 'Publish' }));

  // Assert
  await waitFor(() => expect(mockedApi.publishAnnouncement).toHaveBeenCalledWith('a1'));
});

it('ManageAnnouncementsPage — edit flow — loads the detail, prefills, and updates', async () => {
  // Arrange — a Draft row; the editor loads the full detail via fetchAnnouncement.
  const detail: AnnouncementDto = {
    id: 'a1' as AnnouncementDto['id'],
    workspaceId: 'ws-1' as WorkspaceId,
    title: 'Coverage news',
    body: 'Existing body',
    audience: { kind: 'everyone' },
    pinned: false,
    status: 'Draft',
    author: 'u1' as UserId,
    createdAt: '2026-07-05T10:00:00Z',
    updatedAt: '2026-07-05T10:00:00Z',
  };
  mockedApi.queryManagedAnnouncements.mockResolvedValue(page([row()]));
  mockedApi.fetchAnnouncement.mockResolvedValue(detail);
  mockedApi.updateAnnouncement.mockResolvedValue(detail as never);
  const user = userEvent.setup();

  // Act
  renderWithProviders(<ManageAnnouncementsPage />, { seedMe: ADMIN_ME });
  await screen.findByText('Coverage news');
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  const titleField = await screen.findByLabelText('Title');
  expect(titleField).toHaveValue('Coverage news');
  await user.clear(titleField);
  await user.type(titleField, 'Updated title');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));

  // Assert
  await waitFor(() =>
    expect(mockedApi.updateAnnouncement).toHaveBeenCalledWith('a1', expect.objectContaining({ title: 'Updated title' })),
  );
});

it('ManageAnnouncementsPage — create flow — opens the editor and creates a draft', async () => {
  // Arrange
  mockedApi.createAnnouncement.mockResolvedValue(row() as never);
  const user = userEvent.setup();

  // Act
  renderWithProviders(<ManageAnnouncementsPage />, { seedMe: ADMIN_ME });
  await screen.findByText('No announcements yet');
  await user.click(screen.getByRole('button', { name: 'New announcement' }));
  await user.type(await screen.findByLabelText('Title'), 'Fresh notice');
  await user.type(screen.getByLabelText('Body'), 'Body text');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));

  // Assert
  await waitFor(() =>
    expect(mockedApi.createAnnouncement).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({ title: 'Fresh notice', body: 'Body text', audience: { kind: 'everyone' } }),
    ),
  );
});
