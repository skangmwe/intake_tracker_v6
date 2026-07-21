import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { DashboardWidgetDto } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { SegmentedBarWidget } from './SegmentedBarWidget';

expect.extend(toHaveNoViolations);

const widget: DashboardWidgetDto = {
  id: 'inflight',
  type: 'segmented-bar',
  title: 'Inflight status',
  config: { metric: 'pipeline-by-category' },
  data: {
    total: 8,
    segments: [
      { label: 'Intake', count: 3, percent: 38 },
      { label: 'Execution', count: 5, percent: 62 },
    ],
  },
};

it('SegmentedBarWidget — with data — renders the legend and is accessible', async () => {
  // Arrange / Act
  const { container } = renderWithProviders(
    <SegmentedBarWidget widget={widget} objectType="Request" onDrill={jest.fn()} />,
  );

  // Assert
  expect(screen.getByText('Inflight status')).toBeInTheDocument();
  expect(screen.getByText('Execution')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('SegmentedBarWidget — legend row clicked — drills by category', async () => {
  // Arrange
  const onDrill = jest.fn();
  renderWithProviders(<SegmentedBarWidget widget={widget} objectType="Request" onDrill={onDrill} />);

  // Act — the bar segment carries a unique aria-label.
  await userEvent.click(screen.getByRole('button', { name: 'Execution · 5 records' }));

  // Assert
  expect(onDrill).toHaveBeenCalledWith({ type: 'category', value: 'Execution' });
});

it('SegmentedBarWidget — no onDrill — segments are disabled', () => {
  // Arrange / Act
  renderWithProviders(<SegmentedBarWidget widget={widget} objectType="Request" />);

  // Assert
  expect(screen.getByRole('button', { name: 'Execution · 5 records' })).toBeDisabled();
});
