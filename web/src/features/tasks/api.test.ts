// Unit tests for the tasks API module. apiFetch is mocked at the HTTP boundary (web-testing.md).

import type { RecordId, TaskCreateRequest, WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { createTasks, fetchTaskBundles, fetchTasks, patchTask } from './api';

jest.mock('@/shared/http/apiClient');

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const RECORD = 'AIS-00000001' as RecordId;
const WORKSPACE = '1A150000-0000-4000-8000-000000000001' as WorkspaceId;

describe('tasks api', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetchTasks — GETs the record tasks and passes the abort signal', async () => {
    // Arrange
    mockedFetch.mockResolvedValue([] as never);
    const controller = new AbortController();

    // Act
    await fetchTasks(RECORD, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/requests/${RECORD}/tasks`, { signal: controller.signal });
  });

  it('createTasks — POSTs the create request', () => {
    // Arrange
    mockedFetch.mockResolvedValue([] as never);
    const request: TaskCreateRequest = { kind: 'single', title: 'New', phase: 'Execution' };

    // Act
    createTasks(RECORD, request);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/requests/${RECORD}/tasks`, { method: 'POST', body: request });
  });

  it('patchTask — PATCHes the task by id', () => {
    // Arrange
    mockedFetch.mockResolvedValue(undefined as never);

    // Act
    patchTask('task-1', { status: 'Done' });

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/tasks/task-1', { method: 'PATCH', body: { status: 'Done' } });
  });

  it('fetchTaskBundles — GETs the workspace bundle templates', async () => {
    // Arrange
    mockedFetch.mockResolvedValue([] as never);

    // Act
    await fetchTaskBundles(WORKSPACE);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/workspaces/${WORKSPACE}/task-bundles`, {});
  });
});
