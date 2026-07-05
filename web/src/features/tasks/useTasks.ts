// TanStack Query hooks for Tasks (S4/S5 Tasks & gates tab) — web-state-management.md. Query-key
// factories are exported so pages and tests can target/invalidate precisely. Mutations invalidate the
// record's task list and the workspace Requests list (the Repo URL column rolls up a task URL field).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  PromoteToRequestResult,
  RecordId,
  TaskBundleTemplate,
  TaskCreateRequest,
  TaskDto,
  TaskLibraryFieldDto,
  TaskPatchRequest,
  WorkspaceId,
} from '@shared/types';

import { fetchTaskLibrary } from '@/features/fields/api';

import { createTasks, fetchTaskBundles, fetchTasks, patchTask, promoteTaskToRequest } from './api';

export const tasksKey = (recordId: RecordId) => ['tasks', recordId] as const;
export const taskBundlesKey = (workspaceId: WorkspaceId) => ['task-bundles', workspaceId] as const;
export const taskLibraryKey = (workspaceId: WorkspaceId) => ['task-library', workspaceId] as const;

/** A record's tasks (S4/S5). Access-respecting server-side. */
export function useTasks(recordId: RecordId | undefined) {
  return useQuery<TaskDto[]>({
    queryKey: recordId ? tasksKey(recordId) : ['tasks', 'disabled'],
    queryFn: ({ signal }) => fetchTasks(recordId as RecordId, signal),
    enabled: Boolean(recordId),
  });
}

/** The workspace's bundle templates for the composer's "Add bundle" picker. */
export function useTaskBundles(workspaceId: WorkspaceId | undefined) {
  return useQuery<TaskBundleTemplate[]>({
    queryKey: workspaceId ? taskBundlesKey(workspaceId) : ['task-bundles', 'disabled'],
    queryFn: ({ signal }) => fetchTaskBundles(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

/** The workspace's task-field library for the composer's "Capture a field" picker (S30). */
export function useTaskLibrary(workspaceId: WorkspaceId | undefined) {
  return useQuery<TaskLibraryFieldDto[]>({
    queryKey: workspaceId ? taskLibraryKey(workspaceId) : ['task-library', 'disabled'],
    queryFn: ({ signal }) => fetchTaskLibrary(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

/** Add a single task or apply a bundle. Refreshes the task list + Requests list on success. */
export function useCreateTasks(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<TaskDto[], Error, TaskCreateRequest>({
    mutationFn: (request) => createTasks(recordId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKey(recordId) });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

/** Patch a task (check-off, notes, typed-field value). Refreshes the task list + Requests list. */
export function usePatchTask(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<TaskDto, Error, { taskId: string; patch: TaskPatchRequest }>({
    mutationFn: ({ taskId, patch }) => patchTask(taskId, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKey(recordId) });
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

/** Promote a task to its own Request. Refreshes the task list (the task becomes cancelled). */
export function usePromoteTask(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<PromoteToRequestResult, Error, string>({
    mutationFn: (taskId) => promoteTaskToRequest(taskId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKey(recordId) });
    },
  });
}
