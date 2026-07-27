// Tests for useGlobalObjectFieldEditor (SP3b Slice 2a, Task 6) — editor state + the create / update /
// delete dispatch for a field on a Global custom object. The api module is mocked at the boundary;
// state transitions and which mutation each action dispatches are what's under test.

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import {
  createPlatformObjectField,
  deletePlatformObjectField,
  updatePlatformObjectField,
} from './platformSchema';
import { useGlobalObjectFieldEditor } from './useGlobalObjectFieldEditor';

jest.mock('./platformSchema');
const mockedCreate = createPlatformObjectField as jest.MockedFunction<
  typeof createPlatformObjectField
>;
const mockedUpdate = updatePlatformObjectField as jest.MockedFunction<
  typeof updatePlatformObjectField
>;
const mockedDelete = deletePlatformObjectField as jest.MockedFunction<
  typeof deletePlatformObjectField
>;

const SAMPLE_REQUEST = {
  objectType: 'vendor',
  fieldKey: 'priority',
  displayName: 'Priority',
  fieldType: 'ShortText' as const,
  category: 'WorkspaceLocal' as const,
};

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useGlobalObjectFieldEditor', () => {
  it('useGlobalObjectFieldEditor — starts closed', () => {
    const { result } = renderHook(() => useGlobalObjectFieldEditor(), { wrapper: makeWrapper() });
    expect(result.current.state).toBeNull();
  });

  it('useGlobalObjectFieldEditor — open(create) — sets state with a null fieldKey', () => {
    const { result } = renderHook(() => useGlobalObjectFieldEditor(), { wrapper: makeWrapper() });

    act(() => result.current.open('vendor', 'Vendor', null));

    expect(result.current.state).toEqual({ objectKey: 'vendor', objectLabel: 'Vendor', fieldKey: null });
  });

  it('useGlobalObjectFieldEditor — open(edit) — sets state with the field key', () => {
    const { result } = renderHook(() => useGlobalObjectFieldEditor(), { wrapper: makeWrapper() });

    act(() => result.current.open('vendor', 'Vendor', 'priority'));

    expect(result.current.state).toEqual({
      objectKey: 'vendor',
      objectLabel: 'Vendor',
      fieldKey: 'priority',
    });
  });

  it('useGlobalObjectFieldEditor — close — clears state', () => {
    const { result } = renderHook(() => useGlobalObjectFieldEditor(), { wrapper: makeWrapper() });
    act(() => result.current.open('vendor', 'Vendor', null));

    act(() => result.current.close());

    expect(result.current.state).toBeNull();
  });

  it('useGlobalObjectFieldEditor — onSave in create mode — creates, then closes on success', async () => {
    // Arrange
    mockedCreate.mockResolvedValue({} as never);
    const { result } = renderHook(() => useGlobalObjectFieldEditor(), { wrapper: makeWrapper() });
    act(() => result.current.open('vendor', 'Vendor', null));

    // Act
    act(() => result.current.onSave('priority', SAMPLE_REQUEST, true));

    // Assert
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith('vendor', SAMPLE_REQUEST));
    expect(mockedUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.state).toBeNull());
  });

  it('useGlobalObjectFieldEditor — onSave in edit mode — updates by field key, then closes on success', async () => {
    // Arrange
    mockedUpdate.mockResolvedValue({} as never);
    const { result } = renderHook(() => useGlobalObjectFieldEditor(), { wrapper: makeWrapper() });
    act(() => result.current.open('vendor', 'Vendor', 'priority'));

    // Act
    act(() => result.current.onSave('priority', SAMPLE_REQUEST, false));

    // Assert
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('vendor', 'priority', SAMPLE_REQUEST),
    );
    expect(mockedCreate).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.state).toBeNull());
  });

  it('useGlobalObjectFieldEditor — onSave with no open editor — is a no-op', () => {
    const { result } = renderHook(() => useGlobalObjectFieldEditor(), { wrapper: makeWrapper() });

    act(() => result.current.onSave('priority', SAMPLE_REQUEST, true));

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('useGlobalObjectFieldEditor — onDelete — deletes the field being edited, then closes on success', async () => {
    // Arrange
    mockedDelete.mockResolvedValue(undefined);
    const { result } = renderHook(() => useGlobalObjectFieldEditor(), { wrapper: makeWrapper() });
    act(() => result.current.open('vendor', 'Vendor', 'priority'));

    // Act
    act(() => result.current.onDelete());

    // Assert
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('vendor', 'priority'));
    await waitFor(() => expect(result.current.state).toBeNull());
  });

  it('useGlobalObjectFieldEditor — onDelete in create mode (no fieldKey) — is a no-op', () => {
    const { result } = renderHook(() => useGlobalObjectFieldEditor(), { wrapper: makeWrapper() });
    act(() => result.current.open('vendor', 'Vendor', null));

    act(() => result.current.onDelete());

    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('useGlobalObjectFieldEditor — a failed save surfaces a message and keeps the editor open', async () => {
    // Arrange
    mockedCreate.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useGlobalObjectFieldEditor(), { wrapper: makeWrapper() });
    act(() => result.current.open('vendor', 'Vendor', null));

    // Act
    act(() => result.current.onSave('priority', SAMPLE_REQUEST, true));

    // Assert
    await waitFor(() => expect(result.current.saveError).toBe(
      'Something went wrong saving your change. Try again in a moment.',
    ));
    expect(result.current.state).not.toBeNull();
  });
});
