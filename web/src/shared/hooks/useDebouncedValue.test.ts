// Tests for useDebouncedValue — a logic-only hook (no rendered DOM), so no jest-axe assertion applies
// (web-testing.md). Fake timers drive the debounce window.

import { act, renderHook } from '@testing-library/react';

import { useDebouncedValue } from './useDebouncedValue';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it('useDebouncedValue — initial render — returns the value immediately', () => {
  // Arrange / Act
  const { result } = renderHook(() => useDebouncedValue('alpha', 300));

  // Assert
  expect(result.current).toBe('alpha');
});

it('useDebouncedValue — value change — updates only after the delay elapses', () => {
  // Arrange
  const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
    initialProps: { value: 'a' },
  });

  // Act — change the value; before the delay it still reads the old value.
  rerender({ value: 'b' });
  expect(result.current).toBe('a');

  act(() => {
    jest.advanceTimersByTime(300);
  });

  // Assert
  expect(result.current).toBe('b');
});

it('useDebouncedValue — rapid changes — coalesces to the last value only', () => {
  // Arrange
  const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
    initialProps: { value: 'a' },
  });

  // Act — two changes inside one window; the timer keeps resetting.
  rerender({ value: 'ab' });
  act(() => jest.advanceTimersByTime(100));
  rerender({ value: 'abc' });
  act(() => jest.advanceTimersByTime(100));
  expect(result.current).toBe('a');

  act(() => jest.advanceTimersByTime(300));

  // Assert — only the final value lands.
  expect(result.current).toBe('abc');
});
