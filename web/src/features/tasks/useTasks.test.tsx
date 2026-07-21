// Unit tests for the tasks hooks. The API boundary and the fields task-library call are mocked; a
// local QueryClient wrapper hosts the hooks (web-testing.md — renderHook keeps a local wrapper).

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { RecordId, WorkspaceId } from '@shared/types';

import * as fieldsApi from '@/features/fields/api';

import * as api from './api';
import {
  tasksKey,
  useCreateTasks,
  usePatchTask,
  useTaskBundles,
  useTaskLibrary,
  useTasks,
} from './useTasks';

jest.mock('./api');
jest.mock('@/features/fields/api');

const mockedApi = api as jest.Mocked<typeof api>;
const mockedFields = fieldsApi as jest.Mocked<typeof fieldsApi>;
const RECORD = 'AIS-00000001' as RecordId;
const WORKSPACE = '1A150000-0000-4000-8000-000000000001' as WorkspaceId;

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

describe('useTasks hooks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('useTasks — fetches the record tasks', async () => {
    mockedApi.fetchTasks.mockResolvedValue([]);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useTasks(RECORD), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.fetchTasks).toHaveBeenCalledWith(RECORD, expect.anything());
  });

  it('useTasks — stays disabled with no record id', () => {
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useTasks(undefined), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.fetchTasks).not.toHaveBeenCalled();
  });

  it('useTaskBundles — fetches the workspace bundle templates', async () => {
    mockedApi.fetchTaskBundles.mockResolvedValue([]);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useTaskBundles(WORKSPACE), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.fetchTaskBundles).toHaveBeenCalledWith(WORKSPACE, expect.anything());
  });

  it('useTaskBundles / useTaskLibrary — stay disabled with no workspace id', () => {
    const { Wrapper } = makeWrapper();

    const bundles = renderHook(() => useTaskBundles(undefined), { wrapper: Wrapper });
    const library = renderHook(() => useTaskLibrary(undefined), { wrapper: Wrapper });

    expect(bundles.result.current.fetchStatus).toBe('idle');
    expect(library.result.current.fetchStatus).toBe('idle');
    expect(mockedApi.fetchTaskBundles).not.toHaveBeenCalled();
    expect(mockedFields.fetchTaskLibrary).not.toHaveBeenCalled();
  });

  it('useTaskLibrary — fetches the workspace task-field library', async () => {
    mockedFields.fetchTaskLibrary.mockResolvedValue([]);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useTaskLibrary(WORKSPACE), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedFields.fetchTaskLibrary).toHaveBeenCalledWith(WORKSPACE, expect.anything());
  });

  it('useCreateTasks — creates and invalidates the task + requests lists', async () => {
    mockedApi.createTasks.mockResolvedValue([]);
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useCreateTasks(RECORD), { wrapper: Wrapper });
    await result.current.mutateAsync({ kind: 'single', title: 'New', phase: 'Execution' });

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: tasksKey(RECORD) }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['requests'] });
  });

  it('usePatchTask — patches and invalidates the task list', async () => {
    mockedApi.patchTask.mockResolvedValue({
      id: 'task-1',
      parentRequestId: RECORD,
      title: 'A',
      phase: 'Execution',
      status: 'Done',
      createdAt: '2026-07-01T09:00:00Z',
    } as never);
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => usePatchTask(RECORD), { wrapper: Wrapper });
    await result.current.mutateAsync({ taskId: 'task-1', patch: { status: 'Done' } });

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: tasksKey(RECORD) }));
    expect(mockedApi.patchTask).toHaveBeenCalledWith('task-1', { status: 'Done' });
  });
});
