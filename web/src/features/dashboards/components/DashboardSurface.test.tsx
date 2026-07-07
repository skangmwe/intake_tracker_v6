import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { SavedDashboardDto, SavedDashboardId, WorkspaceId } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { DashboardSurface } from './DashboardSurface';

expect.extend(toHaveNoViolations);

function dashboard(supportsDrillThrough: boolean): SavedDashboardDto {
  return {
    id: 'd1' as SavedDashboardId,
    workspaceId: 'ws-1' as WorkspaceId,
    slug: 'ai-default',
    name: 'AI default',
    audience: { kind: 'everyone' },
    isDefault: true,
    objectType: 'Request',
    supportsDrillThrough,
    widgets: [
      {
        id: 'inflight',
        type: 'segmented-bar',
        title: 'Inflight status',
        config: { metric: 'pipeline-by-category' },
        data: { total: 1, segments: [{ label: 'Intake', count: 1, percent: 100 }] },
      },
      {
        id: 'grid',
        type: 'records-grid',
        title: 'All open requests',
        config: { metric: 'records-grid', objectType: 'Request' },
        data: { objectType: 'Request', columns: ['ID', 'Name'], count: 0, rows: [] },
      },
    ],
  };
}

const header = (
  <div className="dash__head">
    <h1 id="dash-heading" className="dash__title">
      Dashboard
    </h1>
  </div>
);

it('DashboardSurface — groups tiles into a row and renders full-width widgets, accessibly', async () => {
  // Arrange / Act
  const { container } = renderWithProviders(
    <DashboardSurface dashboard={dashboard(true)} header={header} onDrill={jest.fn()} />,
  );

  // Assert — the tile lives in a .dash-row; the grid card renders full-width below.
  expect(container.querySelector('.dash-row')).not.toBeNull();
  expect(screen.getByText('Records · All open requests')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('DashboardSurface — drill enabled — a segment click reaches onDrill', async () => {
  // Arrange
  const onDrill = jest.fn();
  renderWithProviders(<DashboardSurface dashboard={dashboard(true)} header={header} onDrill={onDrill} />);

  // Act
  await userEvent.click(screen.getByRole('button', { name: 'Intake · 1 record' }));

  // Assert
  expect(onDrill).toHaveBeenCalledWith({ type: 'category', value: 'Intake' });
});

it('DashboardSurface — supportsDrillThrough=false — widgets are non-interactive', () => {
  // Arrange / Act — even with an onDrill handler, a viewer dashboard disables drill.
  renderWithProviders(<DashboardSurface dashboard={dashboard(false)} header={header} onDrill={jest.fn()} />);

  // Assert
  expect(screen.getByRole('button', { name: 'Intake · 1 record' })).toBeDisabled();
});
