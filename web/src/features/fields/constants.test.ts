// Unit tests for the field-schema constants helper.

import { fieldTypeLabel } from './constants';

describe('fieldTypeLabel', () => {
  it('fieldTypeLabel — known type — returns the human label', () => {
    expect(fieldTypeLabel('SingleSelect')).toBe('Single-select');
  });

  it('fieldTypeLabel — unknown type — returns the raw value', () => {
    expect(fieldTypeLabel('Mystery')).toBe('Mystery');
  });
});
