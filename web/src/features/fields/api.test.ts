// Unit tests for the fields API module — verifies each call hits the right path/method/body.
// apiFetch is mocked at the HTTP boundary (web-testing.md — mock only at the boundary).

import type { WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import {
  createField,
  createTaskLibraryField,
  fetchFieldCatalog,
  fetchPlatformFields,
  fetchTaskLibrary,
  fetchWorkspaceFields,
  retireField,
  updateField,
  updatePlatformField,
} from './api';

jest.mock('@/shared/http/apiClient');

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const WS = 'ws-1' as WorkspaceId;

describe('fields api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetch.mockResolvedValue(undefined as never);
  });

  it('fetchWorkspaceFields — GETs the fields path with the objectType query', () => {
    fetchWorkspaceFields(WS, 'Request');
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/fields?objectType=Request', {});
  });

  it('createField — POSTs the request body', () => {
    const request = {
      objectType: 'Request',
      fieldKey: 'x',
      displayName: 'X',
      fieldType: 'ShortText',
      category: 'WorkspaceLocal',
    } as const;
    createField(WS, request);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/fields', {
      method: 'POST',
      body: request,
    });
  });

  it('updateField — PATCHes the keyed path', () => {
    const request = {
      objectType: 'Request',
      fieldKey: 'name',
      displayName: 'Name',
      fieldType: 'ShortText',
      category: 'Crossing',
    } as const;
    updateField(WS, 'name', request);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/fields/name', {
      method: 'PATCH',
      body: request,
    });
  });

  it('retireField — POSTs the retire sub-action with objectType', () => {
    retireField(WS, 'name', 'Request');
    expect(mockedFetch).toHaveBeenCalledWith(
      '/v1/workspaces/ws-1/fields/name/retire?objectType=Request',
      { method: 'POST' },
    );
  });

  it('fetchTaskLibrary — GETs the task-fields path', () => {
    fetchTaskLibrary(WS);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/task-fields', {});
  });

  it('createTaskLibraryField — POSTs to task-fields', () => {
    const request = { fieldKey: 'repoUrl', displayName: 'Repo URL', fieldType: 'Url' } as const;
    createTaskLibraryField(WS, request);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/task-fields', {
      method: 'POST',
      body: request,
    });
  });

  it('fetchPlatformFields — GETs the platform fields path', () => {
    fetchPlatformFields();
    expect(mockedFetch).toHaveBeenCalledWith('/v1/platform/fields', {});
  });

  it('updatePlatformField — PATCHes the platform field', () => {
    const request = { displayName: 'Legacy Identifier' };
    updatePlatformField('legacy-id', request);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/platform/fields/legacy-id', {
      method: 'PATCH',
      body: request,
    });
  });

  it('fetchFieldCatalog — GETs the flat field-catalog path', () => {
    fetchFieldCatalog(WS);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/field-catalog', {});
  });

  it('fetchFieldCatalog — passes the abort signal when provided', () => {
    const controller = new AbortController();
    fetchFieldCatalog(WS, controller.signal);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/field-catalog', {
      signal: controller.signal,
    });
  });

  it('fetchWorkspaceFields — passes the abort signal when provided', () => {
    const controller = new AbortController();
    fetchWorkspaceFields(WS, 'Task', controller.signal);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/fields?objectType=Task', {
      signal: controller.signal,
    });
  });
});
