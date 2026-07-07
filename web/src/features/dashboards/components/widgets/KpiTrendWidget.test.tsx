import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { DashboardWidgetDto } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { KpiTrendWidget } from './KpiTrendWidget';

expect.extend(toHaveNoViolations);

const escalations: DashboardWidgetDto = {
  id: 'escal',
  type: 'kpi-with-trend',
  title: 'Escalations this quarter',
  config: { metric: 'escalations-by-quarter-origin' },
  data: {
    value: 9,
    delta: 2,
    deltaLabel: 'vs prior quarter',
    breakdown: [{ label: 'Tax', count: 4 }],
  },
};

it('KpiTrendWidget — escalations — renders trend and drills a chip by origin, accessibly', async () => {
  // Arrange
  const onDrill = jest.fn();
  const { container } = renderWithProviders(
    <KpiTrendWidget widget={escalations} objectType="Request" onDrill={onDrill} />,
  );

  // Assert — value + signed delta.
  expect(screen.getByText('9')).toBeInTheDocument();
  expect(screen.getByText(/\+2 vs prior quarter/)).toBeInTheDocument();

  // Act
  await userEvent.click(screen.getByRole('button', { name: /Show open Tax records/i }));

  // Assert
  expect(onDrill).toHaveBeenCalledWith({ type: 'origin', value: 'Tax' });
  expect(await axe(container)).toHaveNoViolations();
});
