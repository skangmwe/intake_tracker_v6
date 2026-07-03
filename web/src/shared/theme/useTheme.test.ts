import { act, renderHook } from '@testing-library/react';

import { useTheme } from './useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute('data-theme', 'light');
  });

  it('useTheme — initial — reads the painted theme', () => {
    // Arrange
    document.documentElement.setAttribute('data-theme', 'dark');

    // Act
    const { result } = renderHook(() => useTheme());

    // Assert
    expect(result.current.theme).toBe('dark');
  });

  it('useTheme — toggleTheme — flips theme, DOM, and returns the new value', () => {
    // Arrange
    const { result } = renderHook(() => useTheme());

    // Act
    let returned: string | undefined;
    act(() => {
      returned = result.current.toggleTheme();
    });

    // Assert
    expect(returned).toBe('dark');
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme-preference')).toBe('dark');
  });

  it('useTheme — setTheme — applies a specific theme', () => {
    // Arrange
    const { result } = renderHook(() => useTheme());

    // Act
    act(() => {
      result.current.setTheme('dark');
    });

    // Assert
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
