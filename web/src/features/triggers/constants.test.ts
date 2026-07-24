// Unit tests for the trigger option constants — the label lookups and their unknown-value fallback.

import { cadenceLabel, categoryLabel, comparatorLabel } from './constants';

describe('trigger constants', () => {
  it('cadenceLabel — known value — returns the human label', () => {
    // Arrange / Act / Assert
    expect(cadenceLabel('RepeatEveryNDays')).toBe('Repeat every N days');
  });

  it('cadenceLabel — unknown value — echoes the raw value', () => {
    expect(cadenceLabel('Weird')).toBe('Weird');
  });

  it('categoryLabel — known value — returns the human label', () => {
    expect(categoryLabel('sla-reminder')).toBe('SLA reminder');
  });

  it('categoryLabel — unknown value — echoes the raw value', () => {
    expect(categoryLabel('other')).toBe('other');
  });

  it('comparatorLabel — known value — returns the human label', () => {
    expect(comparatorLabel('lt')).toBe('is less than');
  });

  it('comparatorLabel — unknown value — echoes the raw value', () => {
    expect(comparatorLabel('between')).toBe('between');
  });
});
