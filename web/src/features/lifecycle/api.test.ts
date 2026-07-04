// Unit tests for the lifecycle API module — each call hits the right path/method/body. apiFetch is
// mocked at the HTTP boundary (web-testing.md — mock only at the boundary).

import type { UserId, WorkspaceId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import { addApproverMember, fetchLifecycleConfig, removeApproverMember, saveLifecycleConfig } from './api';

jest.mock('@/shared/http/apiClient');

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const WS = 'ws-1' as WorkspaceId;

describe('lifecycle api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFetch.mockResolvedValue(undefined as never);
  });

  it('fetchLifecycleConfig — GETs the lifecycle path', () => {
    fetchLifecycleConfig(WS);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/lifecycle', {});
  });

  it('fetchLifecycleConfig — passes the abort signal when provided', () => {
    const controller = new AbortController();
    fetchLifecycleConfig(WS, controller.signal);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/lifecycle', { signal: controller.signal });
  });

  it('saveLifecycleConfig — PATCHes the request body', () => {
    const request = { lifecycles: [] };
    saveLifecycleConfig(WS, request);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/lifecycle', { method: 'PATCH', body: request });
  });

  it('addApproverMember — POSTs the role and person', () => {
    const request = { roleLabel: 'InfoSec', person: 'Priya Raman' };
    addApproverMember(WS, request);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/approver-teams', { method: 'POST', body: request });
  });

  it('removeApproverMember — DELETEs with the role and userId body', () => {
    const request = { roleLabel: 'InfoSec', userId: 'u-1' as UserId };
    removeApproverMember(WS, request);
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces/ws-1/approver-teams', { method: 'DELETE', body: request });
  });
});
