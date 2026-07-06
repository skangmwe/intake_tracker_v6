// Tests for the HomePage route (S1). Since slice 22 it is a thin wrapper that mounts the Home surface
// (HomeView); the full panel behaviour is covered in features/home. Here we verify it mounts the surface
// (heading + Pin-as-home) with a workspace, and shows the no-workspace note without one. The home api is
// mocked; renderWithProviders seeds `me` and hosts the query + router.

import { screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { HomeDto, WorkspaceId } from '@shared/types';

import { buildMe, buildMembership, renderWithProviders } from '@/test-utils';

import * as homeApi from '@/features/home/api';
import { HomePage } from './HomePage';

expect.extend(toHaveNoViolations);
jest.mock('@/features/home/api');
const mockedHomeApi = homeApi as jest.Mocked<typeof homeApi>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;

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

it('HomePage — with a workspace — mounts the Home surface (heading + Pin-as-home)', async () => {
  // Arrange
  mockedHomeApi.fetchHome.mockResolvedValue(emptyHome());

  // Act
  const { container } = renderWithProviders(<HomePage />, {
    seedMe: buildMe({ memberships: [buildMembership({ workspaceId: WORKSPACE_ID })] }),
  });

  // Assert
  expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /default landing surface/i })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('HomePage — no membership — shows the no-workspace note', () => {
  // Act
  renderWithProviders(<HomePage />, { seedMe: buildMe({ memberships: [] }) });

  // Assert
  expect(screen.getByText(/not a member of any workspace/i)).toBeInTheDocument();
  expect(mockedHomeApi.fetchHome).not.toHaveBeenCalled();
});
