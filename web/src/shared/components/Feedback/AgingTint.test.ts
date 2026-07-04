// Pure helper — no rendered DOM, so no axe assertion applies (web-testing.md).

import { agingTintClass } from './AgingTint';

describe('agingTintClass', () => {
  it('agingTintClass — DueSoon — returns the due-soon tint class', () => {
    expect(agingTintClass('DueSoon')).toBe('mws-aging-tint--due-soon');
  });

  it('agingTintClass — Overdue — returns the overdue tint class', () => {
    expect(agingTintClass('Overdue')).toBe('mws-aging-tint--overdue');
  });

  it('agingTintClass — OnTrack — returns no tint', () => {
    expect(agingTintClass('OnTrack')).toBe('');
  });

  it('agingTintClass — undefined — returns no tint', () => {
    expect(agingTintClass(undefined)).toBe('');
  });
});
