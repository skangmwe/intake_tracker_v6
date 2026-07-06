// Tests for AnnouncementDetailPage (S21) — loading / loaded / 403 no-access / generic error, with
// jest-axe on the loaded + no-access states. useParams resolves from a Route; the api is mocked.

import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { AnnouncementDto, ProblemDetails, UserId, WorkspaceId } from '@shared/types';

import { ApiError } from '@/shared/http/apiClient';
import { renderWithProviders } from '@/test-utils';

import * as api from '../api';
import { AnnouncementDetailPage } from './AnnouncementDetailPage';

expect.extend(toHaveNoViolations);
jest.mock('../api');

const mockedApi = api as jest.Mocked<typeof api>;

const ANNOUNCEMENT: AnnouncementDto = {
  id: 'a1' as AnnouncementDto['id'],
  workspaceId: 'w1' as WorkspaceId,
  title: 'Coverage news',
  body: 'The full announcement body.',
  audience: { kind: 'everyone' },
  pinned: false,
  status: 'Published',
  author: 'u1' as UserId,
  createdAt: '2026-07-05T10:00:00Z',
  updatedAt: '2026-07-05T10:00:00Z',
  publishedAt: '2026-07-05T10:00:00Z',
};

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/announcements/:id" element={<AnnouncementDetailPage />} />
    </Routes>,
    { route: '/announcements/a1' },
  );
}

function problem(status: number, detail: string): ApiError {
  return new ApiError(status, { title: 'x', status, detail } as ProblemDetails);
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('AnnouncementDetailPage — loaded — renders the title, body and back link', async () => {
  // Arrange
  mockedApi.fetchAnnouncement.mockResolvedValue(ANNOUNCEMENT);

  // Act
  const { container } = renderDetail();

  // Assert
  expect(await screen.findByRole('heading', { name: 'Coverage news' })).toBeInTheDocument();
  expect(screen.getByText('The full announcement body.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Back to announcements/ })).toHaveAttribute('href', '/announcements');
  expect(await axe(container)).toHaveNoViolations();
});

it('AnnouncementDetailPage — 403 — shows the no-access message', async () => {
  // Arrange
  mockedApi.fetchAnnouncement.mockRejectedValue(problem(403, 'no access'));

  // Act
  const { container } = renderDetail();

  // Assert — the shared NoAccessPage (S40); never reveals whether the announcement exists.
  expect(
    await screen.findByRole('heading', { name: 'You don’t have access to this announcement.' }),
  ).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('AnnouncementDetailPage — non-403 error — shows the generic error', async () => {
  // Arrange
  mockedApi.fetchAnnouncement.mockRejectedValue(problem(500, 'boom'));

  // Act
  renderDetail();

  // Assert
  expect(await screen.findByRole('heading', { name: 'Announcement unavailable' })).toBeInTheDocument();
});
