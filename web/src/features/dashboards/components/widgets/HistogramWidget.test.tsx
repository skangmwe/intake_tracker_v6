import { screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { DashboardWidgetDto } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { HistogramWidget } from './HistogramWidget';

expect.extend(toHaveNoViolations);

const aging: DashboardWidgetDto = {
  id: 'aging',
  type: 'histogram',
  title: 'Aging in stage',
  config: { metric: 'aging-in-stage' },
  data: {
    buckets: [
      { label: '0–2', count: 4, percent: 100 },
      { label: '3–7', count: 2, percent: 50 },
      { label: '30+', count: 0, percent: 0 },
    ],
  },
};

it('HistogramWidget — with buckets — renders each bucket label and is accessible', async () => {
  // Arrange / Act
  const { container } = renderWithProviders(<HistogramWidget widget={aging} objectType="Request" />);

  // Assert
  expect(screen.getByText('0–2')).toBeInTheDocument();
  expect(screen.getByText('30+')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Aging in stage' })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});
