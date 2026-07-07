import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { DashboardWidgetDto } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { BarBreakdownWidget } from './BarBreakdownWidget';

expect.extend(toHaveNoViolations);

const closures: DashboardWidgetDto = {
  id: 'closures',
  type: 'bar-breakdown',
  title: 'Closures this quarter',
  config: { metric: 'closures-by-outcome' },
  data: {
    bars: [
      { label: 'Live', count: 6, percent: 100 },
      { label: 'Declined', count: 2, percent: 33 },
    ],
  },
};

const perAnalyst: DashboardWidgetDto = {
  id: 'peranalyst',
  type: 'bar-breakdown',
  title: 'Open per analyst',
  config: { metric: 'open-per-analyst' },
  data: { bars: [{ label: 'M. Chen', count: 3, percent: 100 }] },
};

it('BarBreakdownWidget — closures — drills by outcome and is accessible', async () => {
  // Arrange
  const onDrill = jest.fn();
  const { container } = renderWithProviders(
    <BarBreakdownWidget widget={closures} objectType="Request" onDrill={onDrill} />,
  );

  // Act
  await userEvent.click(screen.getByRole('button', { name: /Live/ }));

  // Assert
  expect(onDrill).toHaveBeenCalledWith({ type: 'outcome', value: 'Live' });
  expect(await axe(container)).toHaveNoViolations();
});

it('BarBreakdownWidget — open-per-analyst — bars are non-drillable', () => {
  // Arrange / Act
  renderWithProviders(<BarBreakdownWidget widget={perAnalyst} objectType="Request" onDrill={jest.fn()} />);

  // Assert
  expect(screen.getByRole('button', { name: /M\. Chen/ })).toBeDisabled();
});
