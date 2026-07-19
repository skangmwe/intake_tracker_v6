// Tests for the Watchers card (S4/S5 Watchers & alerts tab). The API boundary is mocked;
// renderWithProviders hosts the queries and seeds /users/me so the toggle knows the caller id. Covers:
// loading / error / empty / list states, the Watch → unwatch toggle (calls the right endpoint with the
// caller id), the Active-alerts section, the always-visible "Notify watchers about" preference toggles
// (prototype reconciliation — shown independent of watch state, driven by myPreferences), and the
// initials helper — each meaningful rendered state under jest-axe.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { RecordId, UserId, WatcherListDto, WatcherPreferences } from '@shared/types';

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

/** The opt-out default — all five categories on. */
function defaultPrefs(overrides: Partial<WatcherPreferences> = {}): WatcherPreferences {
  return {
    notifyGateDecisions: true,
    notifyStatusChanges: true,
    notifyTaskSignoffs: true,
    notifySlaAndDueDateReminders: true,
    notifyMentionsAndComments: true,
    ...overrides,
  };
}

function watching(): WatcherListDto {
  return {
    isWatching: true,
    myPreferences: defaultPrefs(),
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

  it('WatchersCard — not watching — shows the empty roster, the Active-alerts section, and the preference toggles (always visible per the prototype)', async () => {
    // Arrange — no watchers, caller not subscribed; preferences still come back on myPreferences.
    mockedApi.fetchWatchers.mockResolvedValue({ watchers: [], isWatching: false, myPreferences: defaultPrefs() });

    // Act
    const { container } = renderWithProviders(<WatchersCard recordId={RECORD} />, { seedMe: seededMe() });

    // Assert — roster empty + Watch action
    expect(await screen.findByText('No one is watching this record yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Watch this record' })).toHaveAttribute('aria-pressed', 'false');
    // Active alerts section is present with its empty-state copy.
    expect(screen.getByText(/Nothing needs attention right now/)).toBeInTheDocument();
    // Prototype reconciliation — the toggles render even when not watching (no "start watching" gate).
    expect(screen.getByRole('checkbox', { name: 'Gate decisions' })).toBeInTheDocument();
    expect(screen.queryByText(/Start watching this record above/)).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('WatchersCard — watching — lists watchers, reflects the pressed toggle, and renders the five preference toggles with defaults', async () => {
    // Arrange
    mockedApi.fetchWatchers.mockResolvedValue(watching());

    // Act
    const { container } = renderWithProviders(<WatchersCard recordId={RECORD} />, { seedMe: seededMe() });

    // Assert — roster
    expect(await screen.findByText('Ben Builder')).toBeInTheDocument();
    expect(screen.getByText('Priya Raman')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Watching' })).toHaveAttribute('aria-pressed', 'true');
    // Assert — preferences (defaults all on, per the opt-out server model, read from myPreferences).
    expect(screen.getByRole('checkbox', { name: 'Gate decisions' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Status changes' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Task sign-offs' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'SLA & due-date reminders' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Mentions & comments' })).toBeChecked();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('WatchersCard — a divergent preference from myPreferences renders unchecked', async () => {
    // Arrange — the caller's Gate-decisions preference is off; the toggle reflects it.
    mockedApi.fetchWatchers.mockResolvedValue({
      isWatching: true,
      myPreferences: defaultPrefs({ notifyGateDecisions: false }),
      watchers: [{ userId: ME_ID, displayName: 'Priya Raman', subscribedAt: '2026-07-05T10:00:00Z' }],
    });

    // Act
    renderWithProviders(<WatchersCard recordId={RECORD} />, { seedMe: seededMe() });

    // Assert — the toggles render during load too (disabled + defaults), so wait for the fetched
    // preferences to apply before asserting the divergent value.
    await screen.findByText('Priya Raman');
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Gate decisions' })).not.toBeChecked(),
    );
    expect(screen.getByRole('checkbox', { name: 'Status changes' })).toBeChecked();
  });

  it('WatchersCard — unchecking a preference sends a sparse PATCH for that field only', async () => {
    // Arrange — watching, all prefs on; unchecking Gate decisions.
    mockedApi.fetchWatchers.mockResolvedValue({
      isWatching: true,
      myPreferences: defaultPrefs(),
      watchers: [{ userId: ME_ID, displayName: 'Priya Raman', subscribedAt: '2026-07-05T10:00:00Z' }],
    });
    mockedApi.patchMyWatch.mockResolvedValue({
      isWatching: true,
      myPreferences: defaultPrefs({ notifyGateDecisions: false }),
      watchers: [{ userId: ME_ID, displayName: 'Priya Raman', subscribedAt: '2026-07-05T10:00:00Z' }],
    });
    const user = userEvent.setup();
    renderWithProviders(<WatchersCard recordId={RECORD} />, { seedMe: seededMe() });
    const gateCheckbox = await screen.findByRole('checkbox', { name: 'Gate decisions' });

    // Act
    await user.click(gateCheckbox);

    // Assert — the PATCH body carries ONLY the flipped preference.
    await waitFor(() =>
      expect(mockedApi.patchMyWatch).toHaveBeenCalledWith(RECORD, { notifyGateDecisions: false }),
    );
  });

  it('WatchersCard — a non-watcher can set a preference — the toggle is enabled and PATCHes', async () => {
    // Arrange — prototype reconciliation: prefs are settable before subscribing.
    mockedApi.fetchWatchers.mockResolvedValue({ watchers: [], isWatching: false, myPreferences: defaultPrefs() });
    mockedApi.patchMyWatch.mockResolvedValue({
      watchers: [],
      isWatching: false,
      myPreferences: defaultPrefs({ notifyStatusChanges: false }),
    });
    const user = userEvent.setup();
    renderWithProviders(<WatchersCard recordId={RECORD} />, { seedMe: seededMe() });
    const statusCheckbox = await screen.findByRole('checkbox', { name: 'Status changes' });

    // Act
    await user.click(statusCheckbox);

    // Assert
    await waitFor(() =>
      expect(mockedApi.patchMyWatch).toHaveBeenCalledWith(RECORD, { notifyStatusChanges: false }),
    );
  });

  it('WatchersCard — clicking Watch subscribes the caller', async () => {
    // Arrange
    mockedApi.fetchWatchers.mockResolvedValue({ watchers: [], isWatching: false, myPreferences: defaultPrefs() });
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
    mockedApi.fetchWatchers.mockResolvedValue({ watchers: [], isWatching: false, myPreferences: defaultPrefs() });
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
