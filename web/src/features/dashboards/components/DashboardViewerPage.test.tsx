// Tests for the S16 bound dashboard viewer. The api boundary is mocked. Covers the read-only render
// (no drill) and the 404 no-access surface.

import { screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { SavedDashboardDto, SavedDashboardId, WorkspaceId } from '@shared/types';

import { ApiError } from '@/shared/http/apiClient';
import { renderWithProviders } from '@/test-utils';

import * as api from '../api';
import { DashboardViewerPage } from './DashboardViewerPage';

expect.extend(toHaveNoViolations);
jest.mock('../api');
const mockedApi = api as jest.Mocked<typeof api>;

const ID = 'd9' as SavedDashboardId;

function viewerDashboard(): SavedDashboardDto {
  return {
    id: ID,
    workspaceId: 'ws-1' as WorkspaceId,
    slug: 'ai-default',
    name: 'Team dashboard',
    description: 'Read-only view',
    audience: { kind: 'everyone' },
    isDefault: false,
    objectType: 'Request',
    supportsDrillThrough: false,
    widgets: [
      {
        id: 'inflight',
        type: 'segmented-bar',
        title: 'Inflight status',
        config: { metric: 'pipeline-by-category' },
        data: { total: 1, segments: [{ label: 'Intake', count: 1, percent: 100 }] },
      },
    ],
  };
}

beforeEach(() => jest.clearAllMocks());

it('DashboardViewerPage — read-only — renders the dashboard with drill suppressed, accessibly', async () => {
  // Arrange
  mockedApi.fetchDashboard.mockResolvedValue(viewerDashboard());

  // Act
  const { container } = renderWithProviders(<DashboardViewerPage dashboardId={ID} />);

  // Assert — the surface renders and its segments are non-interactive.
  expect(await screen.findByRole('heading', { level: 1, name: 'Team dashboard' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Intake · 1 record' })).toBeDisabled();
  expect(await axe(container)).toHaveNoViolations();
});

it('DashboardViewerPage — 404 — renders the no-access surface', async () => {
  // Arrange
  mockedApi.fetchDashboard.mockRejectedValue(
    new ApiError(404, { type: 'about:blank', title: 'Not found', status: 404, detail: 'no' }),
  );

  // Act
  renderWithProviders(<DashboardViewerPage dashboardId={ID} />);

  // Assert
  expect(await screen.findByText(/don’t have access to this dashboard/i)).toBeInTheDocument();
});
