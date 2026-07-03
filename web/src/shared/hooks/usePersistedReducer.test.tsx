import { act, renderHook } from '@testing-library/react';

import { usePersistedReducer } from './usePersistedReducer';

type Action = { type: 'inc' } | { type: 'reset' };
const reducer = (state: number, action: Action): number => {
  switch (action.type) {
    case 'inc':
      return state + 1;
    case 'reset':
      return 0;
  }
};

describe('usePersistedReducer', () => {
  it('usePersistedReducer — dispatch — reduces state like useReducer', () => {
    // Arrange
    const { result } = renderHook(() => usePersistedReducer(reducer, 0, 'counter'));
    expect(result.current[0]).toBe(0);

    // Act
    act(() => result.current[1]({ type: 'inc' }));
    act(() => result.current[1]({ type: 'inc' }));

    // Assert
    expect(result.current[0]).toBe(2);

    // Act — reset branch
    act(() => result.current[1]({ type: 'reset' }));

    // Assert
    expect(result.current[0]).toBe(0);
  });
});
