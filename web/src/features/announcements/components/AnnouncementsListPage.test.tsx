// Tests for AnnouncementsListPage (S22) — loading / error / empty / list states + jest-axe on the
// meaningful states. The feature api boundary is mocked; renderWithProviders hosts the query + router.

import { screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { AnnouncementListRow, PaginatedResponse } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import * as api from '../api';
import { AnnouncementsListPage } from './AnnouncementsListPage';

expect.extend(toHaveNoViolations);
jest.mock('../api');

const mockedApi = api as jest.Mocked<typeof api>;

function row(overrides: Partial<AnnouncementListRow> = {}): AnnouncementListRow {
  return {
    id: 'a1' as AnnouncementListRow['id'],
    title: 'Coverage news',
    bodySnippet: 'A short preview of the notice.',
    pinned: false,
    publishedAt: '2026-07-05T10:00:00Z',
    status: 'Published',
    author: 'u1' as AnnouncementListRow['author'],
    ...overrides,
  };
}

function page(items: AnnouncementListRow[]): PaginatedResponse<AnnouncementListRow> {
  return { items, totalCount: items.length, page: 1, pageSize: 20 };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('AnnouncementsListPage — loading — shows the loading status', () => {
  // Arrange — a pending query keeps the loading state.
  mockedApi.queryAnnouncements.mockReturnValue(new Promise(() => {}));

  // Act
  renderWithProviders(<AnnouncementsListPage />);

  // Assert
  expect(screen.getByRole('status')).toHaveTextContent('Loading announcements…');
});

it('AnnouncementsListPage — error — shows the error alert', async () => {
  // Arrange
  mockedApi.queryAnnouncements.mockRejectedValue(new Error('boom'));

  // Act
  renderWithProviders(<AnnouncementsListPage />);

  // Assert
  expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t load announcements.');
});

it('AnnouncementsListPage — empty — shows the zero-data state', async () => {
  // Arrange
  mockedApi.queryAnnouncements.mockResolvedValue(page([]));

  // Act
  const { container } = renderWithProviders(<AnnouncementsListPage />);

  // Assert
  expect(await screen.findByText('No announcements yet')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('AnnouncementsListPage — with items — renders each as a link and shows the pinned marker', async () => {
  // Arrange
  mockedApi.queryAnnouncements.mockResolvedValue(page([row({ pinned: true }), row({ id: 'a2' as AnnouncementListRow['id'], title: 'Second' })]));

  // Act
  const { container } = renderWithProviders(<AnnouncementsListPage />);

  // Assert
  const link = await screen.findByRole('link', { name: 'Coverage news' });
  expect(link).toHaveAttribute('href', '/announcements/a1');
  expect(screen.getByText('Pinned')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Second' })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});
