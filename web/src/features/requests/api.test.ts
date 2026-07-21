// Tests for the requests + drafts api wrappers — each builds the right path / method / body over the
// shared apiFetch (mocked here; its own behaviour is covered in shared/http/apiClient.test.ts). Request
// bodies are opaque to these wrappers, so they're passed straight through and asserted by reference.

import type {
  DraftId,
  DraftSaveRequest,
  PaginatedQuery,
  RecordId,
  RequestCreateRequest,
  RequestPatchRequest,
  WorkspaceId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import {
  createRequest,
  deleteDraft,
  fetchDraft,
  fetchDrafts,
  fetchRequest,
  findSimilarRequests,
  patchRequest,
  queryRequests,
  saveDraft,
  setRequestHold,
  setRequestStage,
} from './api';

jest.mock('@/shared/http/apiClient');
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const WS = 'ws-1' as WorkspaceId;
const REC = 'AIS-00000001' as RecordId;
const DRAFT = '5a5e0000-0000-4000-8000-000000000001' as DraftId;
const QUERY: PaginatedQuery = { page: 1, pageSize: 20 };

beforeEach(() => {
  jest.clearAllMocks();
  mockedFetch.mockResolvedValue({} as never);
});

describe('requests api', () => {
  it('createRequest — POSTs the create body', async () => {
    // Arrange
    const body = {} as unknown as RequestCreateRequest;

    // Act
    await createRequest(WS, body);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/workspaces/${WS}/requests`, { method: 'POST', body });
  });

  it('queryRequests — POSTs the query and forwards the abort signal', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await queryRequests(WS, QUERY, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(
      `/v1/workspaces/${WS}/requests/query`,
      expect.objectContaining({ method: 'POST', body: QUERY, signal: controller.signal }),
    );
  });

  it('queryRequests — omits the signal when none is given', async () => {
    // Act
    await queryRequests(WS, QUERY);

    // Assert — the no-signal branch spreads nothing
    expect(mockedFetch.mock.calls[0]![1]).not.toHaveProperty('signal');
  });

  it('fetchRequest — GETs by id and passes the signal', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await fetchRequest(REC, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/requests/${REC}`, { signal: controller.signal });
  });

  it('fetchRequest — omits the signal option when none is given', async () => {
    // Act
    await fetchRequest(REC);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/requests/${REC}`, {});
  });

  it('findSimilarRequests — GETs the similar path carrying the query, with a signal', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await findSimilarRequests(WS, 'billing', controller.signal);

    // Assert
    const [path, opts] = mockedFetch.mock.calls[0]!;
    expect(path).toContain(`/v1/workspaces/${WS}/requests/similar`);
    expect(path).toContain('query=billing');
    expect(opts).toEqual({ signal: controller.signal });
  });

  it('findSimilarRequests — omits the signal when none is given', async () => {
    // Act
    await findSimilarRequests(WS, 'billing');

    // Assert
    expect(mockedFetch.mock.calls[0]![1]).toEqual({});
  });

  it('patchRequest — PATCHes with the If-Match token from the request', async () => {
    // Arrange
    const body = { ifMatch: 'etag-1' } as unknown as RequestPatchRequest;

    // Act
    await patchRequest(REC, body);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(
      `/v1/requests/${REC}`,
      expect.objectContaining({ method: 'PATCH', body, ifMatch: 'etag-1' }),
    );
  });

  it('setRequestStage — POSTs the target stage', async () => {
    // Act
    await setRequestStage(REC, 'validation');

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/requests/${REC}/stage`, {
      method: 'POST',
      body: { toStage: 'validation' },
    });
  });

  it('setRequestHold — POSTs the hold flag and reason', async () => {
    // Act
    await setRequestHold(REC, true, 'waiting on legal');

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/requests/${REC}/hold`, {
      method: 'POST',
      body: { held: true, reason: 'waiting on legal' },
    });
  });
});

describe('drafts api', () => {
  it('saveDraft — POSTs the draft body', async () => {
    // Arrange
    const body = {} as unknown as DraftSaveRequest;

    // Act
    await saveDraft(WS, body);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/workspaces/${WS}/drafts`, { method: 'POST', body });
  });

  it('fetchDrafts — GETs the workspace drafts with an optional signal', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await fetchDrafts(WS, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/workspaces/${WS}/drafts`, { signal: controller.signal });
  });

  it('fetchDrafts — omits the signal when none is given', async () => {
    // Act
    await fetchDrafts(WS);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/workspaces/${WS}/drafts`, {});
  });

  it('fetchDraft — GETs a single draft by id with a signal', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await fetchDraft(DRAFT, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/drafts/${DRAFT}`, { signal: controller.signal });
  });

  it('deleteDraft — DELETEs the draft by id', async () => {
    // Act
    await deleteDraft(DRAFT);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/drafts/${DRAFT}`, { method: 'DELETE' });
  });
});
