// Unit tests for the field-schema constants helper.

import {
  fieldLocationLabel,
  fieldTypeLabel,
  FIELD_LOCATION_OPTIONS,
  lockMessageForSource,
} from './constants';

describe('fieldTypeLabel', () => {
  it('fieldTypeLabel — known type — returns the human label', () => {
    expect(fieldTypeLabel('SingleSelect')).toBe('Single-select');
  });

  it('fieldTypeLabel — unknown type — returns the raw value', () => {
    expect(fieldTypeLabel('Mystery')).toBe('Mystery');
  });
});

describe('lockMessageForSource', () => {
  it('lockMessageForSource — each source — returns the matching lock copy', () => {
    // Assert
    expect(lockMessageForSource('System')).toMatch(/system field/i);
    expect(lockMessageForSource('Platform')).toMatch(/platform-defined field/i);
    expect(lockMessageForSource('User')).toMatch(/global field owned by a workspace/i);
  });
});

describe('fieldLocationLabel', () => {
  it('fieldLocationLabel — Global value — reads "Platform"', () => {
    // Assert — display label renamed, stored value unchanged
    expect(fieldLocationLabel('Global')).toBe('Platform');
    expect(FIELD_LOCATION_OPTIONS.find((option) => option.value === 'Global')?.label).toBe(
      'Platform',
    );
  });

  it('fieldLocationLabel — LocalWorkspace value — unchanged', () => {
    expect(fieldLocationLabel('LocalWorkspace')).toBe('Local Workspace');
  });
});
