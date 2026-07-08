// Tests for the platform-admin api wrappers — each builds the right path / method / body over the
// shared client. The client itself (apiFetch) is mocked; its behaviour is covered in
// shared/http/apiClient.test.ts.

import type { UserId } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import {
  confirmCrossingMap,
  createRoleLabel,
  fetchAccessGrants,
  fetchCrossingCandidates,
  fetchCrossingMap,
  fetchRoleLabels,
  grantAccess,
  proposeCrossingMap,
  provisionWorkspace,
  queryFirmWideAudit,
  renameRoleLabel,
  retireRoleLabel,
  revokeAccess,
} from './api';

jest.mock('@/shared/http/apiClient');
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const USER = '00000000-0000-4000-8000-0000000000aa' as UserId;
const LABEL_ID = '11111111-0000-4000-8000-000000000001';

beforeEach(() => jest.clearAllMocks());

describe('platform-admin api', () => {
  it('fetchCrossingMap — GETs the crossing map and passes the abort signal', async () => {
    mockedFetch.mockResolvedValue([] as never);
    const controller = new AbortController();

    await fetchCrossingMap(controller.signal);

    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toBe('/v1/platform/crossing-map');
    expect((opts as { signal: AbortSignal }).signal).toBe(controller.signal);
  });

  it('fetchRoleLabels — GETs the role labels', async () => {
    mockedFetch.mockResolvedValue([] as never);
    await fetchRoleLabels();
    const [path] = mockedFetch.mock.calls[0]!;
    expect(path).toBe('/v1/platform/role-labels');
  });

  it('fetchCrossingMap — without a signal passes no options (signal is optional)', async () => {
    mockedFetch.mockResolvedValue([] as never);
    await fetchCrossingMap();
    const [, opts] = mockedFetch.mock.calls[0]!;
    expect(opts).toEqual({});
  });

  it('queryFirmWideAudit — without a signal still POSTs the body', async () => {
    mockedFetch.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 25 } as never);
    await queryFirmWideAudit({ page: 1, pageSize: 25 });
    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toBe('/v1/platform/audit/query');
    expect(opts).toMatchObject({ method: 'POST' });
    expect((opts as { signal?: AbortSignal }).signal).toBeUndefined();
  });

  it('createRoleLabel — POSTs the label body', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await createRoleLabel({ label: 'GCO' });
    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toBe('/v1/platform/role-labels');
    expect(opts).toMatchObject({ method: 'POST', body: { label: 'GCO' } });
  });

  it('renameRoleLabel — PATCHes the label by id', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await renameRoleLabel(LABEL_ID, { label: 'New' });
    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toBe(`/v1/platform/role-labels/${LABEL_ID}`);
    expect(opts).toMatchObject({ method: 'PATCH', body: { label: 'New' } });
  });

  it('retireRoleLabel — DELETEs the label by id', async () => {
    mockedFetch.mockResolvedValue(undefined as never);
    await retireRoleLabel(LABEL_ID);
    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toBe(`/v1/platform/role-labels/${LABEL_ID}`);
    expect(opts).toMatchObject({ method: 'DELETE' });
  });

  it('fetchAccessGrants — GETs the privileged grants', async () => {
    mockedFetch.mockResolvedValue({ grants: [] } as never);
    await fetchAccessGrants();
    const [path] = mockedFetch.mock.calls[0]!;
    expect(path).toBe('/v1/platform/access');
  });

  it('grantAccess — POSTs the grant body', async () => {
    mockedFetch.mockResolvedValue(undefined as never);
    await grantAccess({ email: 'x@mws.ai' });
    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toBe('/v1/platform/access');
    expect(opts).toMatchObject({ method: 'POST', body: { email: 'x@mws.ai' } });
  });

  it('revokeAccess — DELETEs the grant by user id', async () => {
    mockedFetch.mockResolvedValue(undefined as never);
    await revokeAccess(USER);
    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toBe(`/v1/platform/access/${USER}`);
    expect(opts).toMatchObject({ method: 'DELETE' });
  });

  it('fetchCrossingCandidates — GETs the candidate fields', async () => {
    mockedFetch.mockResolvedValue({ pgFields: [], aiFields: [] } as never);
    await fetchCrossingCandidates();
    const [path] = mockedFetch.mock.calls[0]!;
    expect(path).toBe('/v1/platform/crossing-map/candidates');
  });

  it('proposeCrossingMap — POSTs the mapping to /v1/platform/crossing-map', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await proposeCrossingMap({ pgFieldDefinitionId: 'pg-1', aiFieldDefinitionId: 'ai-1' });
    expect(mockedFetch).toHaveBeenCalledWith('/v1/platform/crossing-map', {
      method: 'POST',
      body: { pgFieldDefinitionId: 'pg-1', aiFieldDefinitionId: 'ai-1' },
    });
  });

  it('confirmCrossingMap — PATCHes the mapping by id', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await confirmCrossingMap('cm-9');
    expect(mockedFetch).toHaveBeenCalledWith('/v1/platform/crossing-map/cm-9', { method: 'PATCH' });
  });

  it('provisionWorkspace — POSTs the provision body to /v1/workspaces', async () => {
    mockedFetch.mockResolvedValue({ id: 'ws-1', name: 'Litigation', kind: 'pg-dept', prefix: 'LIT' } as never);
    await provisionWorkspace({ name: 'Litigation', prefix: 'LIT', initialAdminEmail: 'admin@mws.ai' });
    expect(mockedFetch).toHaveBeenCalledWith('/v1/workspaces', {
      method: 'POST',
      body: { name: 'Litigation', prefix: 'LIT', initialAdminEmail: 'admin@mws.ai' },
    });
  });

  it('queryFirmWideAudit — POSTs the query body and passes the abort signal', async () => {
    mockedFetch.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 25 } as never);
    const controller = new AbortController();

    await queryFirmWideAudit({ page: 1, pageSize: 25, eventType: 'request.created' as never }, controller.signal);

    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toBe('/v1/platform/audit/query');
    expect(opts).toMatchObject({ method: 'POST', body: { page: 1, pageSize: 25, eventType: 'request.created' } });
    expect((opts as { signal: AbortSignal }).signal).toBe(controller.signal);
  });
});
