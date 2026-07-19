// Unit tests for the lifecycle hooks. The API boundary is mocked; a local QueryClient wrapper hosts
// the hooks (web-testing.md — renderHook keeps a local wrapper).

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ApproverTeamMemberDto, UserId, WorkspaceId } from '@shared/types';

import { buildLifecycleConfig, buildLifecycleSummary } from '@/test-utils';

import * as api from './api';
import {
  lifecycleConfigQueryKey,
  useAddApproverMember,
  useLifecycleConfig,
  useRemoveApproverMember,
  useSaveLifecycleConfig,
  useWorkspaceLifecycles,
} from './useLifecycle';

jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const WS = 'ws-1' as WorkspaceId;

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

describe('useLifecycle hooks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('useLifecycleConfig — fetches the config for the workspace', async () => {
    mockedApi.fetchLifecycleConfig.mockResolvedValue(buildLifecycleConfig());
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useLifecycleConfig(WS), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.lifecycles).toHaveLength(1);
  });

  it('useLifecycleConfig — disabled without a workspace id', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useLifecycleConfig(undefined), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.fetchLifecycleConfig).not.toHaveBeenCalled();
  });

  it('useWorkspaceLifecycles — fetches the lightweight list for the workspace', async () => {
    mockedApi.fetchWorkspaceLifecycles.mockResolvedValue([buildLifecycleSummary()]);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => useWorkspaceLifecycles(WS), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it('useWorkspaceLifecycles — disabled without a workspace id', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useWorkspaceLifecycles(undefined), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.fetchWorkspaceLifecycles).not.toHaveBeenCalled();
  });

  it('useSaveLifecycleConfig — adopts the returned config as the cache baseline (no refetch)', async () => {
    const fresh = buildLifecycleConfig();
    mockedApi.saveLifecycleConfig.mockResolvedValue(fresh);
    const { client, Wrapper } = makeWrapper();

    const { result } = renderHook(() => useSaveLifecycleConfig(WS), { wrapper: Wrapper });
    result.current.mutate({ lifecycles: [] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(lifecycleConfigQueryKey(WS))).toBe(fresh);
  });

  it('useAddApproverMember — invalidates the config so eligible counts refresh', async () => {
    const member: ApproverTeamMemberDto = { userId: 'u-1' as UserId, displayName: 'N. Varga' };
    mockedApi.addApproverMember.mockResolvedValue(member);
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useAddApproverMember(WS), { wrapper: Wrapper });
    result.current.mutate({ roleLabel: 'InfoSec', person: 'N. Varga' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: lifecycleConfigQueryKey(WS) });
  });

  it('useRemoveApproverMember — invalidates the config on success', async () => {
    mockedApi.removeApproverMember.mockResolvedValue(undefined);
    const { client, Wrapper } = makeWrapper();
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRemoveApproverMember(WS), { wrapper: Wrapper });
    result.current.mutate({ roleLabel: 'InfoSec', userId: 'u-1' as UserId });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: lifecycleConfigQueryKey(WS) });
  });
});
