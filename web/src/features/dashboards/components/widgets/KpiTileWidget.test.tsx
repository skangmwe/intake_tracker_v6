import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { DashboardWidgetDto } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { KpiTileWidget } from './KpiTileWidget';

expect.extend(toHaveNoViolations);

const unassigned: DashboardWidgetDto = {
  id: 'unassd',
  type: 'kpi-tile',
  title: 'Unassigned past Intake',
  config: { metric: 'unassigned-past-intake' },
  data: {
    value: 4,
    caption: 'Past Intake with no assigned analyst',
    breakdown: [{ label: 'Tax', count: 2 }],
  },
};

const staticTile: DashboardWidgetDto = {
  id: 'pub',
  type: 'kpi-tile',
  title: 'Published features',
  config: { metric: 'features-published' },
  data: { value: 12 },
};

it('KpiTileWidget — unassigned metric — value drills unassigned and is accessible', async () => {
  // Arrange
  const onDrill = jest.fn();
  const { container } = renderWithProviders(
    <KpiTileWidget widget={unassigned} objectType="Request" onDrill={onDrill} />,
  );

  // Act
  await userEvent.click(screen.getByRole('button', { name: /Show unassigned records/i }));

  // Assert
  expect(onDrill).toHaveBeenCalledWith({ type: 'unassigned' });
  expect(screen.getByText('Past Intake with no assigned analyst')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('KpiTileWidget — non-drillable metric — renders a static value with no button', () => {
  // Arrange / Act
  renderWithProviders(<KpiTileWidget widget={staticTile} objectType="Feature" onDrill={jest.fn()} />);

  // Assert
  expect(screen.getByText('12')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
