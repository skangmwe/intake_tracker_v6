// Unit test for the composer scope-options hook (slice 28). The two source hooks are mocked so this
// stays a pure derivation test (no axe — logic-only hook, no rendered DOM).

import { renderHook } from '@testing-library/react';

import type { WorkspaceId } from '@shared/types';

import { useWorkspaceFields } from '@/features/fields';
import { useLifecycleConfig } from '@/features/lifecycle';

import { useComposerScopeOptions } from './useComposerScopeOptions';

jest.mock('@/features/fields', () => ({ useWorkspaceFields: jest.fn() }));
jest.mock('@/features/lifecycle', () => ({ useLifecycleConfig: jest.fn() }));

const mockFields = useWorkspaceFields as jest.Mock;
const mockLifecycle = useLifecycleConfig as jest.Mock;

const WS = 'ws-1' as WorkspaceId;

it('useComposerScopeOptions — derives dept options from deptPgClient and stages from the default lifecycle', () => {
  // Arrange
  mockFields.mockReturnValue({
    data: {
      fields: [
        {
          fieldKey: 'deptPgClient',
          options: [
            { value: 'Dept', label: 'Dept' },
            { value: 'PG', label: 'PG' },
          ],
        },
      ],
    },
    isLoading: false,
  });
  mockLifecycle.mockReturnValue({
    data: {
      lifecycles: [
        { isDefault: false, stages: [{ key: 'x', label: 'X' }] },
        { isDefault: true, stages: [{ key: 'build', label: 'Build' }] },
      ],
    },
    isLoading: false,
  });

  // Act
  const { result } = renderHook(() => useComposerScopeOptions(WS));

  // Assert
  expect(result.current.deptOptions).toEqual(['Dept', 'PG']);
  expect(result.current.stageOptions).toEqual([{ key: 'build', label: 'Build' }]);
  expect(result.current.stageLabels).toEqual({ build: 'Build' });
  expect(result.current.isLoading).toBe(false);
});

it('useComposerScopeOptions — while loading — returns empty options', () => {
  // Arrange
  mockFields.mockReturnValue({ data: undefined, isLoading: true });
  mockLifecycle.mockReturnValue({ data: undefined, isLoading: false });

  // Act
  const { result } = renderHook(() => useComposerScopeOptions(WS));

  // Assert
  expect(result.current.deptOptions).toEqual([]);
  expect(result.current.stageOptions).toEqual([]);
  expect(result.current.isLoading).toBe(true);
});
