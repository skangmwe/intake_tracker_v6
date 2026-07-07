// Tests for the full dashboard route (S6). The api boundary is mocked; the page is rendered inside a
// matching route so useParams resolves the id. Covers loading, data (ai-default heading + pin), a live
// drill-through refetch, and the 403 no-access surface.

import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { SavedDashboardDto, SavedDashboardId, WorkspaceId } from '@shared/types';

import { ApiError } from '@/shared/http/apiClient';
import { renderWithProviders } from '@/test-utils';

import * as api from '../api';
import { DashboardPage } from './DashboardPage';

expect.extend(toHaveNoViolations);
jest.mock('../api');
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
  };
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/dashboards/:id" element={<DashboardPage />} />
    </Routes>,
    { route: '/dashboards/d1' },
  );
}

beforeEach(() => jest.clearAllMocks());

it('DashboardPage — loading — shows the loading status', () => {
  // Arrange
  mockedApi.fetchDashboard.mockReturnValue(new Promise<SavedDashboardDto>(() => {}));

  // Act
  renderPage();

  // Assert
  expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard…');
});

it('DashboardPage — ai-default — renders the prototype heading + pin, accessibly', async () => {
  // Arrange
  mockedApi.fetchDashboard.mockResolvedValue(aiDefault());

  // Act
  const { container } = renderPage();

  // Assert — the subtitle appears only once the data has loaded (the 'Dashboard' heading also
  // renders during loading, so await a loaded-only element before the synchronous checks).
  expect(await screen.findByText('AI Solutions workspace · seeded default')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /default landing surface/i })).toBeInTheDocument();
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
