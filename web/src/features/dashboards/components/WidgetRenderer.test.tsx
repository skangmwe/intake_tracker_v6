import { screen } from '@testing-library/react';

import type { DashboardWidgetDto, WidgetType } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { WidgetRenderer } from './WidgetRenderer';

function widget(type: WidgetType, data: unknown): DashboardWidgetDto {
  return { id: `w-${type}`, type, title: `Title ${type}`, config: { metric: 'pending-signoff' }, data };
}

it('WidgetRenderer — kpi-tile — renders the KPI value', () => {
  renderWithProviders(<WidgetRenderer widget={widget('kpi-tile', { value: 3 })} objectType="Request" />);
  expect(screen.getByText('3')).toBeInTheDocument();
});

it('WidgetRenderer — segmented-bar — renders the tile title', () => {
  renderWithProviders(
    <WidgetRenderer
      widget={widget('segmented-bar', { total: 1, segments: [{ label: 'Intake', count: 1, percent: 100 }] })}
      objectType="Request"
    />,
  );
  expect(screen.getByText('Title segmented-bar')).toBeInTheDocument();
});

it('WidgetRenderer — unknown/line-timeseries type — renders nothing', () => {
  const { container } = renderWithProviders(
    <WidgetRenderer widget={widget('line-timeseries', { points: [] })} objectType="Request" />,
  );
  // The renderer returns null for the unsupported type; no card is painted.
  expect(container.querySelector('[data-ds="card"]')).toBeNull();
});
