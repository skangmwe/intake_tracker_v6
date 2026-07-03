import { applyTheme, getActiveTheme, getStoredTheme, THEME_STORAGE_KEY } from './theme';

describe('theme primitives', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('getStoredTheme — dark stored — returns dark', () => {
    // Arrange
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    // Act + Assert
    expect(getStoredTheme()).toBe('dark');
  });

  it('getStoredTheme — nothing stored — returns null', () => {
    expect(getStoredTheme()).toBeNull();
  });

  it('getStoredTheme — junk stored — returns null', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(getStoredTheme()).toBeNull();
  });

  it('getActiveTheme — data-theme dark — returns dark', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(getActiveTheme()).toBe('dark');
  });

  it('getActiveTheme — no attribute — defaults to light', () => {
    expect(getActiveTheme()).toBe('light');
  });

  it('applyTheme — sets the DOM attribute and localStorage', () => {
    // Act
    applyTheme('dark');

    // Assert
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});
