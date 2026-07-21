import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { DashboardWidgetDto } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { HeatmapWidget } from './HeatmapWidget';

expect.extend(toHaveNoViolations);

const heatmap: DashboardWidgetDto = {
  id: 'heatmap',
  type: 'heatmap-matrix',
  title: 'Requests by Dept/PG/Client × status',
  config: { metric: 'origin-by-status-heatmap' },
  data: {
    columns: [
      { label: 'Intake', group: 'In flight' },
      { label: 'Execution' },
      { label: 'Validation' },
      { label: 'Delivery' },
      { label: 'Live', group: 'Closed', groupStart: true },
      { label: 'Declined' },
      { label: 'Withdrawn' },
      { label: 'Duplicate' },
    ],
    rows: [
      {
        label: 'Tax',
        cells: [{ count: 2 }, { count: 0 }, { count: 1 }, { count: 0 }, { count: 3 }, { count: 0 }, { count: 0 }, { count: 0 }],
      },
    ],
  },
};

it('HeatmapWidget — in-flight cell — drills by cell and is accessible', async () => {
  // Arrange
  const onDrill = jest.fn();
  const { container } = renderWithProviders(
    <HeatmapWidget widget={heatmap} objectType="Request" onDrill={onDrill} />,
  );

  // Act
  await userEvent.click(screen.getByRole('button', { name: 'Tax × Intake · 2 records' }));

  // Assert
  expect(onDrill).toHaveBeenCalledWith({ type: 'cell', origin: 'Tax', category: 'Intake' });
  expect(await axe(container)).toHaveNoViolations();
});

it('HeatmapWidget — closed cell — drills by closedCell', async () => {
  // Arrange
  const onDrill = jest.fn();
  renderWithProviders(<HeatmapWidget widget={heatmap} objectType="Request" onDrill={onDrill} />);

  // Act
  await userEvent.click(screen.getByRole('button', { name: 'Tax × Closed · Live · 3 records' }));

  // Assert
  expect(onDrill).toHaveBeenCalledWith({ type: 'closedCell', origin: 'Tax', outcome: 'Live' });
});

it('HeatmapWidget — no onDrill — cells are disabled', () => {
  // Arrange / Act
  renderWithProviders(<HeatmapWidget widget={heatmap} objectType="Request" />);

  // Assert
  expect(screen.getByRole('button', { name: 'Tax × Intake · 2 records' })).toBeDisabled();
});
