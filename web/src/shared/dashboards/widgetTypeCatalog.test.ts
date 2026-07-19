// Unit tests for the composer's widget-type catalog (slice 28). Pure data + predicates.

import {
  COMPOSER_DIMENSIONS,
  COMPOSER_METRICS,
  COMPOSER_WIDGET_TYPES,
  widgetNeedsDimension,
  widgetNeedsMetric,
  widgetNeedsRowLimit,
} from './widgetTypeCatalog';

describe('widgetTypeCatalog', () => {
  it('widgetNeedsMetric — kpi-tile — true, other types false', () => {
    // Assert
    expect(widgetNeedsMetric('kpi-tile')).toBe(true);
    expect(widgetNeedsMetric('bar-breakdown')).toBe(false);
    expect(widgetNeedsMetric('records-grid')).toBe(false);
  });

  it('widgetNeedsDimension — breakdown and segmented — true', () => {
    // Assert
    expect(widgetNeedsDimension('bar-breakdown')).toBe(true);
    expect(widgetNeedsDimension('segmented-bar')).toBe(true);
    expect(widgetNeedsDimension('kpi-tile')).toBe(false);
  });

  it('widgetNeedsRowLimit — records-grid — true', () => {
    // Assert
    expect(widgetNeedsRowLimit('records-grid')).toBe(true);
    expect(widgetNeedsRowLimit('kpi-tile')).toBe(false);
  });

  it('catalogs — cover the four composer kinds and the metric/dimension vocab', () => {
    // Assert — the four prototype kinds map onto the shared WidgetType union.
    expect(COMPOSER_WIDGET_TYPES.map((entry) => entry.value)).toEqual([
      'kpi-tile',
      'bar-breakdown',
      'segmented-bar',
      'records-grid',
    ]);
    expect(COMPOSER_METRICS.map((entry) => entry.value)).toEqual([
      'count',
      'unassigned',
      'overdue',
      'high-priority',
    ]);
    expect(COMPOSER_DIMENSIONS.map((entry) => entry.value)).toEqual([
      'origin',
      'stage',
      'analyst',
      'priority',
    ]);
  });
});
