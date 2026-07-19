// Tests for the full dashboard route (S6 multi-dashboard, slice 28). The api boundary is mocked; the
// composer scope hook is stubbed (it reads other features' endpoints). Covers loading, the switcher
// header on a seeded fixed dashboard, a live drill-through refetch, the New-dashboard sheet, and the
// 403 no-access surface.

import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type {
  DashboardListDto,
  SavedDashboardDto,
  SavedDashboardId,
  WorkspaceId,
} from '@shared/types';

import { ApiError } from '@/shared/http/apiClient';
import { renderWithProviders } from '@/test-utils';

import * as api from '../api';
import { DashboardPage } from './DashboardPage';

expect.extend(toHaveNoViolations);
jest.mock('../api');
// The composer's scope hook reads the fields + lifecycle endpoints; stub it so the page test stays
// scoped to the dashboard api boundary.
jest.mock('../useComposerScopeOptions', () => ({
  useComposerScopeOptions: () => ({
    deptOptions: [],
    stageOptions: [],
    stageLabels: {},
    isLoading: false,
  }),
}));

const mockedApi = api as jest.Mocked<typeof api>;

function aiDefault(): SavedDashboardDto {
  return {
    id: 'd1' as SavedDashboardId,
    workspaceId: 'ws-1' as WorkspaceId,
    slug: 'ai-default',
    name: 'AI Solutions default dashboard',
    audience: { kind: 'everyone' },
    isDefault: true,
    objectType: 'Request',
    supportsDrillThrough: true,
    widgets: [
      {
        id: 'inflight',
        type: 'segmented-bar',
        title: 'Inflight status',
        config: { metric: 'pipeline-by-category' },
        data: { total: 1, segments: [{ label: 'Intake', count: 1, percent: 100 }] },
      },
    ],
    isSeeded: true,
    visibility: 'Shared',
    layoutMode: 'Fixed',
  };
}

const EMPTY_LIST: DashboardListDto = { workspaceId: 'ws-1' as WorkspaceId, items: [] };

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/dashboards/:id" element={<DashboardPage />} />
    </Routes>,
    { route: '/dashboards/d1' },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.fetchDashboardList.mockResolvedValue(EMPTY_LIST);
});

it('DashboardPage — loading — shows the loading status', () => {
  // Arrange
  mockedApi.fetchDashboard.mockReturnValue(new Promise<SavedDashboardDto>(() => {}));

  // Act
  renderPage();

  // Assert
  expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard…');
});

it('DashboardPage — seeded fixed dashboard — renders the switcher title + pin, accessibly', async () => {
  // Arrange
  mockedApi.fetchDashboard.mockResolvedValue(aiDefault());

  // Act
  const { container } = renderPage();

  // Assert — the switcher title carries the dashboard name; the pin is present; no Edit-layout (fixed).
  expect(
    await screen.findByRole('button', { name: /AI Solutions default dashboard/ }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /default landing surface/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit layout' })).not.toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('DashboardPage — segment click — refetches with the drill filter', async () => {
  // Arrange
  mockedApi.fetchDashboard.mockResolvedValue(aiDefault());
  renderPage();

  // Act — await the segment (loaded-only) so we don't race the async load, then drill it.
  await userEvent.click(await screen.findByRole('button', { name: 'Intake · 1 record' }));

  // Assert — the by-id read is re-issued with the drill payload.
  await waitFor(() =>
    expect(
      mockedApi.fetchDashboard.mock.calls.some(
        (call) => JSON.stringify(call[1]) === JSON.stringify({ type: 'category', value: 'Intake' }),
      ),
    ).toBe(true),
  );
});

it('DashboardPage — New dashboard — opens the compose sheet', async () => {
  // Arrange
  mockedApi.fetchDashboard.mockResolvedValue(aiDefault());
  renderPage();

  // Act
  await userEvent.click(await screen.findByRole('button', { name: /New dashboard/ }));

  // Assert
  expect(screen.getByRole('dialog', { name: 'New dashboard' })).toBeInTheDocument();
});

it('DashboardPage — 403 — renders the no-access surface', async () => {
  // Arrange
  mockedApi.fetchDashboard.mockRejectedValue(
    new ApiError(403, { type: 'about:blank', title: 'Forbidden', status: 403, detail: 'no' }),
  );

  // Act
  renderPage();

  // Assert
  expect(await screen.findByText(/don’t have access to this dashboard/i)).toBeInTheDocument();
});
