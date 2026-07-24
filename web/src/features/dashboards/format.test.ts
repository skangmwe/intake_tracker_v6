// Unit tests for the dashboards presentation helpers — date formatting, drill labels, and the widget
// data narrowing. Pure functions, no rendering.

import type { DashboardWidgetDto } from '@shared/types';

import { formatDate } from '@/shared/utils/dateFormat';

import { cellCount, drillLabel, EM_DASH, formatDashDate, widgetData } from './format';

describe('formatDashDate', () => {
  it('formatDashDate — full ISO date — renders numeric date with year', () => {
    // Arrange / Act
    const result = formatDashDate('2026-06-28');

    // Assert
    expect(result).toBe(formatDate(new Date(2026, 5, 28)));
  });

  it('formatDashDate — null — renders an em-dash', () => {
    expect(formatDashDate(null)).toBe(EM_DASH);
  });

  it('formatDashDate — malformed month — renders an em-dash', () => {
    expect(formatDashDate('2026-13-01')).toBe(EM_DASH);
  });
});

describe('drillLabel', () => {
  it('drillLabel — undefined — empty string', () => {
    expect(drillLabel(undefined)).toBe('');
  });

  it('drillLabel — origin — "Origin · X"', () => {
    expect(drillLabel({ type: 'origin', value: 'Tax' })).toBe('Origin · Tax');
  });

  it('drillLabel — category — "Status · X"', () => {
    expect(drillLabel({ type: 'category', value: 'Execution' })).toBe('Status · Execution');
  });

  it('drillLabel — cell — "origin × category"', () => {
    expect(drillLabel({ type: 'cell', origin: 'IP', category: 'Validation' })).toBe('IP × Validation');
  });

  it('drillLabel — closedCell — appends "(closed)"', () => {
    expect(drillLabel({ type: 'closedCell', origin: 'M&A', outcome: 'Live' })).toBe(
      'M&A × Live (closed)',
    );
  });

  it('drillLabel — unassigned — fixed label', () => {
    expect(drillLabel({ type: 'unassigned' })).toBe('Unassigned past Intake');
  });

  it('drillLabel — outcome — "Closed · X"', () => {
    expect(drillLabel({ type: 'outcome', value: 'Declined' })).toBe('Closed · Declined');
  });
});

describe('cellCount', () => {
  it('cellCount — zero — em-dash', () => {
    expect(cellCount(0)).toBe(EM_DASH);
  });

  it('cellCount — positive — the number as a string', () => {
    expect(cellCount(4)).toBe('4');
  });
});

describe('widgetData', () => {
  it('widgetData — returns the data field narrowed to the requested shape', () => {
    // Arrange
    const widget = {
      id: 'w',
      type: 'kpi-tile',
      title: 'X',
      config: { metric: 'pending-signoff' },
      data: { value: 7 },
    } as DashboardWidgetDto;

    // Act
    const data = widgetData<{ value: number }>(widget);

    // Assert
    expect(data.value).toBe(7);
  });
});
