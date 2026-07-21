// Unit tests for the S4 Status-tab pure presentation helpers (record-detail reconciliation).

import { buildRequestDto } from '@/test-utils';

import { formatSubmitted, slaPresentation, statusCategoryOf } from './statusPresentation';

describe('formatSubmitted', () => {
  it('formatSubmitted — valid ISO — long-form day/month/year', () => {
    // Arrange / Act
    const result = formatSubmitted('2026-07-03T13:00:00Z');

    // Assert — locale-formatted; assert the pieces that are stable across locales.
    expect(result).toMatch(/2026/);
    expect(result).not.toBe('—');
  });

  it('formatSubmitted — unparseable — em-dash', () => {
    // Arrange / Act / Assert
    expect(formatSubmitted('not-a-date')).toBe('—');
  });
});

describe('slaPresentation', () => {
  it('slaPresentation — Overdue — error tone, Overdue label', () => {
    // Arrange / Act
    const sla = slaPresentation('Overdue');

    // Assert
    expect(sla).toMatchObject({ tone: 'error', iconKey: 'overdue', label: 'Overdue' });
  });

  it('slaPresentation — DueSoon — warning tone', () => {
    expect(slaPresentation('DueSoon')).toMatchObject({ tone: 'warning', iconKey: 'dueSoon', label: 'Due soon' });
  });

  it('slaPresentation — OnTrack — success tone', () => {
    expect(slaPresentation('OnTrack')).toMatchObject({ tone: 'success', iconKey: 'onTrack', label: 'On track' });
  });

  it('slaPresentation — undefined (no due date) — muted "No due date"', () => {
    expect(slaPresentation(undefined)).toMatchObject({ tone: 'muted', iconKey: 'none', label: 'No due date' });
  });
});

describe('statusCategoryOf', () => {
  it('statusCategoryOf — current stage resolves — returns its category', () => {
    // Arrange — default record sits at the intake stage (category "Intake").
    const request = buildRequestDto({ stage: 'execution' });

    // Act / Assert
    expect(statusCategoryOf(request)).toBe('Execution');
  });

  it('statusCategoryOf — stage not in the list — undefined', () => {
    // Arrange
    const request = buildRequestDto({ stage: 'ghost-stage' });

    // Act / Assert
    expect(statusCategoryOf(request)).toBeUndefined();
  });
});
