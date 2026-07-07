// Tests for the Dashboards list (S17). The api boundary is mocked; renderWithProviders seeds `me` so a
// workspace resolves. Covers the populated list, the zero-data empty state, and the bound Dashboard-
// viewer redirect (S16).

import { screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type {
  DashboardListDto,
  DashboardListItemDto,
  SavedDashboardDto,
  SavedDashboardId,
  WorkspaceId,
} from '@shared/types';

import { buildMe, buildMembership, renderWithProviders } from '@/test-utils';
import { useMe } from '@/features/users/useMe';

import * as api from '../api';
import { DashboardsListPage } from './DashboardsListPage';

expect.extend(toHaveNoViolations);
jest.mock('../api');
// Mock useMe directly (the project convention — see RequestsListPage.test.tsx). Seeding `me` into
// the query cache instead would trigger the real fetchMe background refetch, which destabilises the
// workspace resolution the list depends on.
jest.mock('@/features/users/useMe');
const mockedApi = api as jest.Mocked<typeof api>;
const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const meInWorkspace = () => buildMe({ memberships: [buildMembership({ workspaceId: WORKSPACE_ID })] });
function seedUseMe(me = meInWorkspace()) {
  mockedUseMe.mockReturnValue({ data: me, isLoading: false, isError: false } as ReturnType<typeof useMe>);
}

function item(overrides: Partial<DashboardListItemDto> = {}): DashboardListItemDto {
  return {
    id: 'd1' as SavedDashboardId,
    workspaceId: WORKSPACE_ID,
    slug: 'ai-default',
    name: 'AI default',
    description: 'The seeded default',
    audience: { kind: 'everyone' },
    isDefault: true,
    objectType: 'Request',
    widgetCount: 6,
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

const list = (items: DashboardListItemDto[]): DashboardListDto => ({ workspaceId: WORKSPACE_ID, items });

beforeEach(() => jest.clearAllMocks());

it('DashboardsListPage — populated — renders each dashboard with badge + meta, accessibly', async () => {
  // Arrange
  seedUseMe();
  mockedApi.fetchDashboardList.mockResolvedValue(list([item()]));

  // Act
  const { container } = renderWithProviders(<DashboardsListPage />);

  // Assert
  expect(await screen.findByText('AI default')).toBeInTheDocument();
  expect(screen.getByText('Default')).toBeInTheDocument();
  expect(screen.getByText(/Everyone · 6 widgets/)).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('DashboardsListPage — empty — shows the zero-data state', async () => {
  // Arrange
  seedUseMe();
  mockedApi.fetchDashboardList.mockResolvedValue(list([]));

  // Act
  renderWithProviders(<DashboardsListPage />);

  // Assert
  expect(await screen.findByText('No dashboards yet')).toBeInTheDocument();
});

it('DashboardsListPage — bound viewer — renders the read-only dashboard, not the list', async () => {
  // Arrange — a user bound to a single dashboard.
  const bound = buildMe({
    memberships: [buildMembership({ workspaceId: WORKSPACE_ID })],
    boundDashboardId: 'd9' as SavedDashboardId,
  });
  seedUseMe(bound);
  const dashboard: SavedDashboardDto = {
    id: 'd9' as SavedDashboardId,
    workspaceId: WORKSPACE_ID,
    slug: 'ai-default',
    name: 'My bound dashboard',
    audience: { kind: 'everyone' },
    isDefault: false,
    objectType: 'Request',
    supportsDrillThrough: false,
    widgets: [],
  };
  mockedApi.fetchDashboard.mockResolvedValue(dashboard);

  // Act
  renderWithProviders(<DashboardsListPage />);

  // Assert — the viewer renders; the list endpoint is never hit.
  expect(await screen.findByRole('heading', { level: 1, name: 'My bound dashboard' })).toBeInTheDocument();
  expect(mockedApi.fetchDashboardList).not.toHaveBeenCalled();
});
