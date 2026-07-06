// Tests for HomeView (S1) — the loading / no-workspace / error / populated / empty-panel states, with
// jest-axe on the two rendered content states (populated and all-empty). The home api boundary is
// mocked; renderWithProviders seeds `me` (so a workspace resolves) and hosts the query + router.

import { screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { HomeDto, WorkspaceId } from '@shared/types';

import { buildMe, buildMembership, renderWithProviders } from '@/test-utils';

import * as api from './api';
import { HomeView } from './HomeView';

expect.extend(toHaveNoViolations);
jest.mock('./api');
const mockedApi = api as jest.Mocked<typeof api>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const meWithWorkspace = () => buildMe({ memberships: [buildMembership({ workspaceId: WORKSPACE_ID })] });

function fullHome(): HomeDto {
  return {
    workspaceId: WORKSPACE_ID,
    decisions: [
      { recordId: 'REQ-1042', name: 'Clause extraction', gateLabel: 'Build → QA', roleLabel: 'AI Solutions Manager', openedAt: '2026-07-04T12:00:00Z' },
    ],
    decisionCount: 1,
    work: [
      { recordId: 'REQ-0991', name: 'Billing checker', stageLabel: 'QA', origin: 'Finance', dueDate: '2026-07-01', slaStatus: 'Overdue' },
    ],
    workCount: 1,
    activity: [
      { recordId: 'REQ-0899', name: 'Deposition summarizer', eventType: 'gate.resolved', actorName: 'M. Reyes', eventAt: '2026-07-06T10:00:00Z' },
    ],
    sinceLastSeenAt: '2026-07-02T00:00:00Z',
    triage: [
      { recordId: 'REQ-1061', name: 'K-1 extraction', origin: 'Escalated · Tax', receivedAt: '2026-07-06T11:00:00Z' },
    ],
    triageCount: 1,
    pinnedAnnouncements: [
      { announcementId: 'a1', title: 'Intake review moves', bodySnippet: 'Now on Fridays.', publishedAt: '2026-07-05T10:00:00Z' },
    ],
  };
}

function emptyHome(): HomeDto {
  return {
    workspaceId: WORKSPACE_ID,
    decisions: [], decisionCount: 0,
    work: [], workCount: 0,
    activity: [], sinceLastSeenAt: null,
    triage: [], triageCount: 0,
    pinnedAnnouncements: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('HomeView — home pending — shows the loading status', () => {
  // Arrange — a workspace resolves but the home query never settles.
  mockedApi.fetchHome.mockReturnValue(new Promise<HomeDto>(() => {}));

  // Act
  renderWithProviders(<HomeView />, { seedMe: meWithWorkspace() });

  // Assert
  expect(screen.getByRole('status')).toHaveTextContent('Loading your home…');
});

it('HomeView — no workspace membership — shows the no-workspace note and never fetches', () => {
  // Arrange — the seeded user belongs to no workspace.
  renderWithProviders(<HomeView />, { seedMe: buildMe({ memberships: [] }) });

  // Assert
  expect(screen.getByText(/not a member of any workspace/i)).toBeInTheDocument();
  expect(mockedApi.fetchHome).not.toHaveBeenCalled();
});

it('HomeView — home error — shows the error alert', async () => {
  // Arrange
  mockedApi.fetchHome.mockRejectedValue(new Error('boom'));

  // Act
  renderWithProviders(<HomeView />, { seedMe: meWithWorkspace() });

  // Assert
  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t load your home/i);
});

it('HomeView — populated — renders every panel and its items, and is accessible', async () => {
  // Arrange
  mockedApi.fetchHome.mockResolvedValue(fullHome());

  // Act
  const { container } = renderWithProviders(<HomeView />, { seedMe: meWithWorkspace() });

  // Assert — panel headings + representative items + the pinned strip.
  expect(await screen.findByRole('heading', { level: 2, name: 'Needs your decision' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Your work today' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Since you were last here' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'New to triage' })).toBeInTheDocument();
  expect(screen.getByText('Clause extraction')).toBeInTheDocument();
  expect(screen.getByText('Intake review moves')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /default landing surface/i })).toHaveAttribute('aria-pressed', 'true');

  expect(await axe(container)).toHaveNoViolations();
});

it('HomeView — all panels empty — shows each empty note, no pinned strip, and is accessible', async () => {
  // Arrange
  mockedApi.fetchHome.mockResolvedValue(emptyHome());

  // Act
  const { container } = renderWithProviders(<HomeView />, { seedMe: meWithWorkspace() });

  // Assert
  expect(await screen.findByText('No gates are waiting on you right now.')).toBeInTheDocument();
  expect(screen.getByText('Nothing assigned to you today.')).toBeInTheDocument();
  expect(screen.getByText('No activity since your last visit.')).toBeInTheDocument();
  expect(screen.getByText('Nothing waiting to be triaged.')).toBeInTheDocument();
  expect(screen.queryByRole('note')).not.toBeInTheDocument();

  expect(await axe(container)).toHaveNoViolations();
});
