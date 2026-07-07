// Tests for the S32 shared-dashboards management panel. The api boundary is mocked. Covers the list, the
// retire flow (PATCH { retire: true }), the edit-sharing flow (PATCH { name, audience }), and the empty
// state.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type {
  DashboardListDto,
  DashboardListItemDto,
  SavedDashboardDto,
  SavedDashboardId,
  WorkspaceId,
} from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import * as api from '../api';
import { DashboardsManagementSection } from './DashboardsManagementSection';

expect.extend(toHaveNoViolations);
jest.mock('../api');
const mockedApi = api as jest.Mocked<typeof api>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;

function item(): DashboardListItemDto {
  return {
    id: 'd1' as SavedDashboardId,
    workspaceId: WORKSPACE_ID,
    slug: 'ai-default',
    name: 'AI default',
    audience: { kind: 'everyone' },
    isDefault: true,
    objectType: 'Request',
    widgetCount: 6,
    updatedAt: '2026-07-01T00:00:00Z',
  };
}

const list = (items: DashboardListItemDto[]): DashboardListDto => ({ workspaceId: WORKSPACE_ID, items });

beforeEach(() => jest.clearAllMocks());

it('DashboardsManagementSection — lists dashboards with audience + actions, accessibly', async () => {
  // Arrange
  mockedApi.fetchDashboardList.mockResolvedValue(list([item()]));

  // Act
  const { container } = renderWithProviders(<DashboardsManagementSection workspaceId={WORKSPACE_ID} />);

  // Assert
  expect(await screen.findByText('AI default')).toBeInTheDocument();
  expect(screen.getByText('Everyone')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit sharing' })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('DashboardsManagementSection — retire — confirms and PATCHes retire:true', async () => {
  // Arrange
  mockedApi.fetchDashboardList.mockResolvedValue(list([item()]));
  mockedApi.patchDashboard.mockResolvedValue({} as SavedDashboardDto);
  renderWithProviders(<DashboardsManagementSection workspaceId={WORKSPACE_ID} />);
  await screen.findByText('AI default');

  // Act
  await userEvent.click(screen.getByRole('button', { name: 'Retire' }));
  await userEvent.click(screen.getByRole('button', { name: /Retire AI default/ }));

  // Assert
  await waitFor(() =>
    expect(mockedApi.patchDashboard).toHaveBeenCalledWith('d1', { retire: true }),
  );
});

it('DashboardsManagementSection — edit sharing — saves name + audience', async () => {
  // Arrange
  mockedApi.fetchDashboardList.mockResolvedValue(list([item()]));
  mockedApi.patchDashboard.mockResolvedValue({} as SavedDashboardDto);
  renderWithProviders(<DashboardsManagementSection workspaceId={WORKSPACE_ID} />);
  await screen.findByText('AI default');

  // Act
  await userEvent.click(screen.getByRole('button', { name: 'Edit sharing' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  // Assert
  await waitFor(() =>
    expect(mockedApi.patchDashboard).toHaveBeenCalledWith('d1', {
      name: 'AI default',
      audience: { kind: 'everyone' },
    }),
  );
});

it('DashboardsManagementSection — no dashboards — shows the empty note', async () => {
  // Arrange
  mockedApi.fetchDashboardList.mockResolvedValue(list([]));

  // Act
  renderWithProviders(<DashboardsManagementSection workspaceId={WORKSPACE_ID} />);

  // Assert
  expect(await screen.findByText(/No shared dashboards in this workspace yet/)).toBeInTheDocument();
});
