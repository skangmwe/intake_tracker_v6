// Unit tests for the S4 Status-tab pure presentation helpers (record-detail reconciliation).

import { formatSubmitted, slaPresentation } from './statusPresentation';

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
    expect(slaPresentation('DueSoon')).toMatchObject({
      tone: 'warning',
      iconKey: 'dueSoon',
      label: 'Due soon',
    });
  });

  it('slaPresentation — OnTrack — success tone', () => {
    expect(slaPresentation('OnTrack')).toMatchObject({
      tone: 'success',
      iconKey: 'onTrack',
      label: 'On track',
    });
  });

  it('slaPresentation — undefined (no due date) — muted "No due date"', () => {
    expect(slaPresentation(undefined)).toMatchObject({
      tone: 'muted',
      iconKey: 'none',
      label: 'No due date',
    });
  });
});
