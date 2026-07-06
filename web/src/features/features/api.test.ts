// Tests for the Feature Catalog api wrappers — each builds the right path / method / body over the
// shared apiFetch (mocked; its own behaviour is covered in shared/http/apiClient.test.ts). Request
// bodies are opaque to these wrappers, so they're passed straight through and asserted by reference.

import type {
  DraftId,
  FeatureCreateRequest,
  FeaturePatchRequest,
  PaginatedQuery,
  RecordId,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

import {
  addToCatalog,
  createFeature,
  deleteFeatureDraft,
  deprecateFeature,
  fetchFeature,
  fetchFeatureDraft,
  patchFeature,
  publishFeature,
  queryFeatures,
} from './api';

jest.mock('@/shared/http/apiClient');
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const REC = 'AIS-00000009' as RecordId;
const DRAFT = '5a5e0000-0000-4000-8000-0000000000f1' as DraftId;
const QUERY: PaginatedQuery = { page: 1, pageSize: 20 };

beforeEach(() => {
  jest.clearAllMocks();
  mockedFetch.mockResolvedValue({} as never);
});

describe('features api', () => {
  it('queryFeatures — POSTs the query and forwards the abort signal', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await queryFeatures(QUERY, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(
      '/v1/features/query',
      expect.objectContaining({ method: 'POST', body: QUERY, signal: controller.signal }),
    );
  });

  it('queryFeatures — omits the signal when none is given', async () => {
    // Act
    await queryFeatures(QUERY);

    // Assert
    expect(mockedFetch.mock.calls[0]![1]).not.toHaveProperty('signal');
  });

  it('fetchFeature — GETs by id and passes the signal', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await fetchFeature(REC, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/features/${REC}`, { signal: controller.signal });
  });

  it('fetchFeature — omits the signal option when none is given', async () => {
    // Act
    await fetchFeature(REC);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/features/${REC}`, {});
  });

  it('createFeature — POSTs the create body', async () => {
    // Arrange
    const body = {} as unknown as FeatureCreateRequest;

    // Act
    await createFeature(body);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith('/v1/features', { method: 'POST', body });
  });

  it('patchFeature — PATCHes with the If-Match token from the request', async () => {
    // Arrange
    const body = { ifMatch: 'etag-9' } as unknown as FeaturePatchRequest;

    // Act
    await patchFeature(REC, body);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(
      `/v1/features/${REC}`,
      expect.objectContaining({ method: 'PATCH', body, ifMatch: 'etag-9' }),
    );
  });

  it('publishFeature — POSTs to the publish action', async () => {
    // Act
    await publishFeature(REC);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/features/${REC}/publish`, { method: 'POST' });
  });

  it('deprecateFeature — POSTs to the deprecate action', async () => {
    // Act
    await deprecateFeature(REC);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/features/${REC}/deprecate`, { method: 'POST' });
  });

  it('addToCatalog — POSTs the prefill request against the source record', async () => {
    // Act
    await addToCatalog(REC);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/requests/${REC}/add-to-catalog`, { method: 'POST' });
  });

  it('fetchFeatureDraft — GETs the draft by id with an optional signal', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await fetchFeatureDraft(DRAFT, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/drafts/${DRAFT}`, { signal: controller.signal });
  });

  it('fetchFeatureDraft — omits the signal when none is given', async () => {
    // Act
    await fetchFeatureDraft(DRAFT);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/drafts/${DRAFT}`, {});
  });

  it('deleteFeatureDraft — DELETEs the draft by id', async () => {
    // Act
    await deleteFeatureDraft(DRAFT);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/drafts/${DRAFT}`, { method: 'DELETE' });
  });
});
