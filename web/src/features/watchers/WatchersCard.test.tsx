// Tests for the Watchers card (S4/S5 Watchers & alerts tab). The API boundary is mocked;
// renderWithProviders hosts the queries and seeds /users/me so the toggle knows the caller id. Covers:
// loading / error / empty / list states, the Watch → unwatch toggle (calls the right endpoint with the
// caller id), the static "Notify watchers about" rules, and the initials helper — each meaningful
// rendered state under jest-axe.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { RecordId, UserId, WatcherListDto } from '@shared/types';

import { buildMe, renderWithProviders } from '@/test-utils';

import * as api from './api';
import { WatchersCard, initials } from './WatchersCard';

expect.extend(toHaveNoViolations);
jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const RECORD = 'AIS-00000001' as RecordId;
const ME_ID = '00000000-0000-0000-0000-000000000001' as UserId;

function seededMe() {
  return buildMe({ user: { ...buildMe().user, id: ME_ID } });
}

function watching(): WatcherListDto {
  return {
    isWatching: true,
    watchers: [
      { userId: ME_ID, displayName: 'Priya Raman', subscribedAt: '2026-07-05T10:00:00Z' },
      { userId: '00000000-0000-0000-0000-0000000000bb' as UserId, displayName: 'Ben Builder', subscribedAt: '2026-07-05T09:00:00Z' },
    ],
  };
}

beforeEach(() => jest.clearAllMocks());

describe('initials', () => {
  it('initials — two names — first letter of each', () => {
    expect(initials('Priya Raman')).toBe('PR');
  });
  it('initials — one name — single letter', () => {
    expect(initials('Ben')).toBe('B');
  });
  it('initials — blank — falls back to a placeholder', () => {
    expect(initials('   ')).toBe('?');
  });
});

describe('WatchersCard', () => {
  it('WatchersCard — loading — shows a status message', async () => {
    // Arrange — never resolves.
    mockedApi.fetchWatchers.mockReturnValue(new Promise<WatcherListDto>(() => {}));

    // Act
    const { container } = renderWithProviders(<WatchersCard recordId={RECORD} />, { seedMe: seededMe() });

    // Assert
    expect(screen.getByText('Loading watchers…')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('WatchersCard — error — shows a recovery message', async () => {
    // Arrange
    mockedApi.fetchWatchers.mockRejectedValue(new Error('boom'));

    // Act
    const { container } = renderWithProviders(<WatchersCard recordId={RECORD} />, { seedMe: seededMe() });

    // Assert
    expect(await screen.findByText(/Watchers couldn’t be loaded/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('WatchersCard — empty — shows the empty note and a Watch action, plus the rules', async () => {
    // Arrange
    mockedApi.fetchWatchers.mockResolvedValue({ watchers: [], isWatching: false });

    // Act
    const { container } = renderWithProviders(<WatchersCard recordId={RECORD} />, { seedMe: seededMe() });

    // Assert
    expect(await screen.findByText('No one is watching this record yet.')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Watch this record' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // The static firm-default rules always render.
    expect(screen.getByText('Gate decisions')).toBeInTheDocument();
    expect(screen.getByText('Mentions')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('WatchersCard — watching — lists watchers and reflects the pressed toggle', async () => {
    // Arrange
    mockedApi.fetchWatchers.mockResolvedValue(watching());

    // Act
    const { container } = renderWithProviders(<WatchersCard recordId={RECORD} />, { seedMe: seededMe() });

    // Assert
    expect(await screen.findByText('Ben Builder')).toBeInTheDocument();
    expect(screen.getByText('Priya Raman')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Watching' })).toHaveAttribute('aria-pressed', 'true');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('WatchersCard — clicking Watch subscribes the caller', async () => {
    // Arrange
    mockedApi.fetchWatchers.mockResolvedValue({ watchers: [], isWatching: false });
    mockedApi.watchRecord.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<WatchersCard recordId={RECORD} />, { seedMe: seededMe() });
    await screen.findByRole('button', { name: 'Watch this record' });

    // Act
    await user.click(screen.getByRole('button', { name: 'Watch this record' }));

    // Assert
    await waitFor(() => expect(mockedApi.watchRecord).toHaveBeenCalledWith(RECORD));
  });

  it('WatchersCard — a failed toggle surfaces a recovery message', async () => {
    // Arrange
    mockedApi.fetchWatchers.mockResolvedValue({ watchers: [], isWatching: false });
    mockedApi.watchRecord.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderWithProviders(<WatchersCard recordId={RECORD} />, { seedMe: seededMe() });
    await screen.findByRole('button', { name: 'Watch this record' });

    // Act
    await user.click(screen.getByRole('button', { name: 'Watch this record' }));

    // Assert
    expect(await screen.findByText(/Your subscription couldn’t be updated/)).toBeInTheDocument();
  });

  it('WatchersCard — clicking Watching unsubscribes the caller by id', async () => {
    // Arrange
    mockedApi.fetchWatchers.mockResolvedValue(watching());
    mockedApi.unwatchRecord.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<WatchersCard recordId={RECORD} />, { seedMe: seededMe() });
    await screen.findByRole('button', { name: 'Watching' });

    // Act
    await user.click(screen.getByRole('button', { name: 'Watching' }));

    // Assert — unsubscribe targets the caller's own id.
    await waitFor(() => expect(mockedApi.unwatchRecord).toHaveBeenCalledWith(RECORD, ME_ID));
  });
});
