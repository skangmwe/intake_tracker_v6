import { renderHook } from '@testing-library/react';

import { useHoldGuard } from './useHoldGuard';

describe('useHoldGuard', () => {
  it('useHoldGuard — InProgress record is not blocked and carries no reason', () => {
    const { result } = renderHook(() => useHoldGuard('InProgress'));
    expect(result.current.blocked).toBe(false);
    expect(result.current.disable).toBe(false);
    expect(result.current.reason).toBeNull();
    expect(result.current.statusHold).toBe('InProgress');
  });

  it('useHoldGuard — OnHold record blocks and returns a reactivation-hint reason', () => {
    const { result } = renderHook(() => useHoldGuard('OnHold'));
    expect(result.current.blocked).toBe(true);
    expect(result.current.disable).toBe(true);
    expect(result.current.reason).toContain('on hold');
    expect(result.current.reason).toContain('Status tab');
    expect(result.current.statusHold).toBe('OnHold');
  });

  it('useHoldGuard — null or undefined statusHold is treated as safe (unknown → do not block optimistically)', () => {
    const { result: nullish } = renderHook(() => useHoldGuard(null));
    expect(nullish.current.blocked).toBe(false);
    expect(nullish.current.disable).toBe(false);
    expect(nullish.current.reason).toBeNull();

    const { result: undef } = renderHook(() => useHoldGuard(undefined));
    expect(undef.current.blocked).toBe(false);
    expect(undef.current.disable).toBe(false);
    expect(undef.current.reason).toBeNull();
  });
});
