// Unit tests for the composer draft/wire helpers (slice 28). Pure — no React, no I/O.

import type { DashboardWidgetConfig, DashboardWidgetDto } from '@shared/types';

import {
  draftFromWidget,
  draftToComposeRequest,
  emptyWidgetDraft,
  isWidgetDraftValid,
  scopeLabel,
  toggleScopeValue,
} from './composerModel';

describe('composerModel', () => {
  it('emptyWidgetDraft — defaults to a half-width KPI count widget', () => {
    // Act
    const draft = emptyWidgetDraft();

    // Assert
    expect(draft.type).toBe('kpi-tile');
    expect(draft.metric).toBe('count');
    expect(draft.width).toBe('Half');
    expect(draft.depts).toEqual([]);
    expect(draft.stages).toEqual([]);
  });

  it('draftToComposeRequest — kpi widget — includes metric, omits group-by and rowLimit', () => {
    // Arrange
    const draft = {
      ...emptyWidgetDraft(),
      title: '  Open  ',
      type: 'kpi-tile' as const,
      metric: 'unassigned' as const,
    };

    // Act
    const request = draftToComposeRequest(draft, 2);

    // Assert
    expect(request.title).toBe('Open'); // trimmed
    expect(request.metric).toBe('unassigned');
    expect(request.groupByDimension).toBeUndefined();
    expect(request.rowLimit).toBeUndefined();
    expect(request.sortOrder).toBe(2);
  });

  it('draftToComposeRequest — breakdown widget — includes group-by, omits metric', () => {
    // Arrange
    const draft = {
      ...emptyWidgetDraft(),
      title: 'By dept',
      type: 'bar-breakdown' as const,
      groupByDimension: 'origin' as const,
    };

    // Act
    const request = draftToComposeRequest(draft, 0);

    // Assert
    expect(request.groupByDimension).toBe('origin');
    expect(request.metric).toBeUndefined();
  });

  it('draftToComposeRequest — records-grid widget — includes rowLimit', () => {
    // Arrange
    const draft = {
      ...emptyWidgetDraft(),
      title: 'Records',
      type: 'records-grid' as const,
      rowLimit: 8,
    };

    // Act
    const request = draftToComposeRequest(draft, 0);

    // Assert
    expect(request.rowLimit).toBe(8);
    expect(request.metric).toBeUndefined();
    expect(request.groupByDimension).toBeUndefined();
  });

  it('draftFromWidget — reads the composed config back into a draft', () => {
    // Arrange
    const widget: DashboardWidgetDto = {
      id: 'w1',
      type: 'kpi-tile',
      title: 'Overdue',
      config: {
        composedMetric: 'overdue',
        width: 'Full',
        sortOrder: 1,
        depts: ['Finance'],
        stages: ['execution'],
      },
      data: {},
    };

    // Act
    const draft = draftFromWidget(widget);

    // Assert
    expect(draft.id).toBe('w1');
    expect(draft.metric).toBe('overdue');
    expect(draft.width).toBe('Full');
    expect(draft.depts).toEqual(['Finance']);
    expect(draft.stages).toEqual(['execution']);
  });

  it('isWidgetDraftValid — blank title — false; non-blank — true', () => {
    // Assert
    expect(isWidgetDraftValid({ ...emptyWidgetDraft(), title: '   ' })).toBe(false);
    expect(isWidgetDraftValid({ ...emptyWidgetDraft(), title: 'X' })).toBe(true);
  });

  it('toggleScopeValue — adds a missing value then removes it', () => {
    // Assert
    expect(toggleScopeValue([], 'Finance')).toEqual(['Finance']);
    expect(toggleScopeValue(['Finance'], 'Finance')).toEqual([]);
  });

  it('scopeLabel — no scope — All departments', () => {
    // Assert
    expect(scopeLabel({} as DashboardWidgetConfig, {})).toBe('All departments');
  });

  it('scopeLabel — depts and stages — joins, mapping stage keys to labels', () => {
    // Arrange
    const config = { depts: ['Finance'], stages: ['execution'] } as DashboardWidgetConfig;

    // Act + Assert
    expect(scopeLabel(config, { execution: 'Execution' })).toBe('Finance · Execution');
  });
});
