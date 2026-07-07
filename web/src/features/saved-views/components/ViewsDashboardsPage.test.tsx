// Tests for ViewsDashboardsPage — the admin gate (non-admin warning vs admin content), the four
// object-type sections, the shared-dashboards management panel, and the no-workspace error.
// SavedViewsSection and DashboardsManagementSection are stubbed so the page is tested in isolation from
// their data hooks; useMe is mocked so the gate is deterministic. jest-axe on each meaningful state.

import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';

import type { MeDto } from '@shared/types';

import { buildMe, buildMembership, renderWithProviders } from '@/test-utils';

import * as meHook from '@/features/users/useMe';
import { ViewsDashboardsPage } from './ViewsDashboardsPage';

// Stub the section — it owns its own data hooks; the page only composes and gates.
jest.mock('./SavedViewsSection', () => ({
  SavedViewsSection: ({ objectType }: { objectType: string }) => (
    <div data-testid="views-section">{objectType}</div>
  ),
}));
// Stub the dashboards management panel — it owns its own data hooks; the page only composes it.
jest.mock('@/features/dashboards', () => ({
  DashboardsManagementSection: () => <div data-testid="dashboards-management" />,
}));
jest.mock('@/features/users/useMe');

const mockedMe = meHook as jest.Mocked<typeof meHook>;
type MeResult = ReturnType<typeof meHook.useMe>;

function mockMe(me: MeDto) {
  mockedMe.useMe.mockReturnValue({ data: me, isLoading: false, isError: false } as MeResult);
}

const ADMIN_ME = buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] });
const MEMBER_ME = buildMe({ memberships: [buildMembership({ level: 'Member' })] });

beforeEach(() => jest.clearAllMocks());

it('ViewsDashboardsPage — non-admin — shows a warning and no sections', async () => {
  // Arrange
  mockMe(MEMBER_ME);

  // Act
  const { container } = renderWithProviders(<ViewsDashboardsPage />);

  // Assert
  expect(screen.getByRole('alert')).toHaveTextContent(/available to workspace admins/i);
  expect(screen.queryAllByTestId('views-section')).toHaveLength(0);
  expect(await axe(container)).toHaveNoViolations();
});

it('ViewsDashboardsPage — admin — renders one section per object type', async () => {
  // Arrange
  mockMe(ADMIN_ME);

  // Act
  const { container } = renderWithProviders(<ViewsDashboardsPage />);

  // Assert — Request / Feature / Task / Announcement.
  expect(screen.getAllByTestId('views-section')).toHaveLength(4);
  expect(await axe(container)).toHaveNoViolations();
});

it('ViewsDashboardsPage — admin — renders the shared-dashboards management panel', () => {
  // Arrange
  mockMe(ADMIN_ME);

  // Act
  renderWithProviders(<ViewsDashboardsPage />);

  // Assert
  expect(screen.getByTestId('dashboards-management')).toBeInTheDocument();
});

it('ViewsDashboardsPage — no workspace — shows an error alert', async () => {
  // Arrange — a user with no memberships resolves no workspace.
  mockMe(buildMe({ memberships: [] }));

  // Act
  const { container } = renderWithProviders(<ViewsDashboardsPage />);

  // Assert
  expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i);
  expect(await axe(container)).toHaveNoViolations();
});
