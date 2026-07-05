// Tests for the bell centre (S20). The notifications API boundary is mocked; renderWithProviders
// hosts the queries + router. Covers: the unread badge + accessible name, closed/open states, the
// loaded feed with unread markers, the empty "all caught up" state, mark-all-read, per-item mark-read,
// the Announcement-history stub, the relativeTime helper, and jest-axe on closed + open.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { NotificationDto, PaginatedResponse, RecordId } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import * as api from '@/features/notifications/api';
import { BellMenu, relativeTime } from './BellMenu';

expect.extend(toHaveNoViolations);
jest.mock('@/features/notifications/api');

const mockedApi = api as jest.Mocked<typeof api>;

function feed(items: NotificationDto[]): PaginatedResponse<NotificationDto> {
  return { items, totalCount: items.length, page: 1, pageSize: 20 };
}

function notification(overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: 'n1',
    category: 'gate-decided',
    recordId: 'AIS-00000001' as RecordId,
    summary: 'A gate decision was recorded on AIS-00000001',
    createdAt: '2026-07-05T10:00:00Z',
    sourceEventId: '11111111-1111-4111-8111-111111111111',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.fetchUnreadCount.mockResolvedValue({ count: 0 });
  mockedApi.queryNotifications.mockResolvedValue(feed([]));
  mockedApi.markAllNotificationsRead.mockResolvedValue(undefined);
  mockedApi.markNotificationRead.mockResolvedValue(undefined);
});

const bell = () => screen.getByRole('button', { name: /Notifications/ });

describe('relativeTime', () => {
  const now = new Date('2026-07-05T12:00:00Z').getTime();
  it('relativeTime — under a minute — just now', () => {
    expect(relativeTime('2026-07-05T11:59:40Z', now)).toBe('just now');
  });
  it('relativeTime — minutes', () => {
    expect(relativeTime('2026-07-05T11:30:00Z', now)).toBe('30m');
  });
  it('relativeTime — hours', () => {
    expect(relativeTime('2026-07-05T09:00:00Z', now)).toBe('3h');
  });
  it('relativeTime — days', () => {
    expect(relativeTime('2026-07-03T12:00:00Z', now)).toBe('2d');
  });
  it('relativeTime — a week or more — falls back to a short date', () => {
    const iso = '2026-06-20T12:00:00Z';
    const expected = new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    expect(relativeTime(iso, now)).toBe(expected);
  });
  it('relativeTime — invalid — empty string', () => {
    expect(relativeTime('not-a-date', now)).toBe('');
  });
});

describe('BellMenu', () => {
  it('BellMenu — closed — the trigger is collapsed and the feed is not fetched', async () => {
    renderWithProviders(<BellMenu />);
    await waitFor(() => expect(mockedApi.fetchUnreadCount).toHaveBeenCalled());
    expect(bell()).toHaveAttribute('aria-expanded', 'false');
    expect(mockedApi.queryNotifications).not.toHaveBeenCalled();
  });

  it('BellMenu — unread — shows a badge and folds the count into the accessible name', async () => {
    // Arrange
    mockedApi.fetchUnreadCount.mockResolvedValue({ count: 4 });

    // Act
    renderWithProviders(<BellMenu />);

    // Assert
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications, 4 unread' })).toBeInTheDocument());
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('BellMenu — opened with items — lists notifications and can mark all read', async () => {
    // Arrange
    mockedApi.fetchUnreadCount.mockResolvedValue({ count: 1 });
    mockedApi.queryNotifications.mockResolvedValue(feed([notification()]));
    const user = userEvent.setup();
    renderWithProviders(<BellMenu />);

    // Act
    await user.click(bell());

    // Assert
    expect(await screen.findByText('A gate decision was recorded on AIS-00000001')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(mockedApi.markAllNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it('BellMenu — opened empty — shows the all-caught-up note + Announcement history stub', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<BellMenu />);

    // Act
    await user.click(bell());

    // Assert
    expect(await screen.findByText('You’re all caught up.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Announcement history' })).toBeInTheDocument();
  });

  it('BellMenu — a notification without a record marks read and closes without navigating', async () => {
    // Arrange — a record-less notification exercises the no-navigate branch.
    mockedApi.fetchUnreadCount.mockResolvedValue({ count: 1 });
    mockedApi.queryNotifications.mockResolvedValue(
      feed([notification({ id: 'n2', recordId: undefined, summary: 'An announcement was posted' })]),
    );
    const user = userEvent.setup();
    renderWithProviders(<BellMenu />);
    await user.click(bell());
    const item = await screen.findByRole('button', { name: /An announcement was posted/ });

    // Act
    await user.click(item);

    // Assert — marked read, menu closed; no record to navigate to.
    expect(mockedApi.markNotificationRead).toHaveBeenCalledWith('n2');
    await waitFor(() => expect(bell()).toHaveAttribute('aria-expanded', 'false'));
  });

  it('BellMenu — clicking a notification marks it read and closes the menu', async () => {
    // Arrange
    mockedApi.fetchUnreadCount.mockResolvedValue({ count: 1 });
    mockedApi.queryNotifications.mockResolvedValue(feed([notification()]));
    const user = userEvent.setup();
    renderWithProviders(<BellMenu />);
    await user.click(bell());
    const item = await screen.findByRole('button', { name: /A gate decision was recorded/ });

    // Act
    await user.click(item);

    // Assert
    expect(mockedApi.markNotificationRead).toHaveBeenCalledWith('n1');
    await waitFor(() => expect(bell()).toHaveAttribute('aria-expanded', 'false'));
  });

  it('BellMenu — no axe violations (closed and open)', async () => {
    // Arrange
    mockedApi.fetchUnreadCount.mockResolvedValue({ count: 2 });
    mockedApi.queryNotifications.mockResolvedValue(feed([notification()]));
    const user = userEvent.setup();
    const { container } = renderWithProviders(<BellMenu />);

    // Assert — closed
    await waitFor(() => expect(mockedApi.fetchUnreadCount).toHaveBeenCalled());
    expect(await axe(container)).toHaveNoViolations();

    // Act + Assert — open
    await user.click(bell());
    await screen.findByText('A gate decision was recorded on AIS-00000001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
