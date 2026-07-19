// Unit tests for the Toolkit API wrappers — verifies each call hits the right path/method and that
// create/patch build multipart FormData (payload JSON + optional file). apiFetch/apiFetchBlob are
// mocked at the module boundary (web-testing.md — mock only at the boundary).

import type {
  ToolkitItemCreateRequest,
  ToolkitItemId,
  ToolkitItemPatchRequest,
  ToolkitQuery,
  WorkspaceId,
} from '@shared/types';

import { apiFetch, apiFetchBlob } from '@/shared/http/apiClient';

import {
  createToolkitItem,
  downloadToolkitAttachment,
  fetchToolkitItem,
  patchToolkitItem,
  queryToolkit,
} from './api';

jest.mock('@/shared/http/apiClient', () => ({
  apiFetch: jest.fn(() => Promise.resolve({})),
  apiFetchBlob: jest.fn(() => Promise.resolve(new Blob())),
}));

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedApiFetchBlob = apiFetchBlob as jest.MockedFunction<typeof apiFetchBlob>;

const WS = 'ws-1' as WorkspaceId;
const ITEM = 'AIS-00000073' as ToolkitItemId;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('toolkit api', () => {
  it('queryToolkit — POSTs the query to the workspace-scoped list path', async () => {
    // Arrange
    const query: ToolkitQuery = { page: 1, pageSize: 20 };

    // Act
    await queryToolkit(WS, query);

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/v1/workspaces/${WS}/toolkit/query`,
      expect.objectContaining({ method: 'POST', body: query }),
    );
  });

  it('fetchToolkitItem — GETs the item by id', async () => {
    // Act
    await fetchToolkitItem(ITEM);

    // Assert
    expect(mockedApiFetch).toHaveBeenCalledWith(`/v1/toolkit/${ITEM}`, {});
  });

  it('createToolkitItem — POSTs multipart with a payload part and the file', async () => {
    // Arrange
    const request: ToolkitItemCreateRequest = { kind: 'Prompt', name: 'X' };
    const file = new File(['body'], 'asset.md', { type: 'text/markdown' });

    // Act
    await createToolkitItem(WS, request, file);

    // Assert
    const opts = mockedApiFetch.mock.calls[0]?.[1];
    expect(mockedApiFetch.mock.calls[0]?.[0]).toBe(`/v1/workspaces/${WS}/toolkit`);
    expect(opts?.method).toBe('POST');
    const form = opts?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('payload')).toBe(JSON.stringify(request));
    expect(form.get('file')).toBe(file);
  });

  it('createToolkitItem — omits the file part when none is chosen', async () => {
    // Act
    await createToolkitItem(WS, { kind: 'Playbook', name: 'X' }, null);

    // Assert
    const form = mockedApiFetch.mock.calls[0]?.[1]?.body as FormData;
    expect(form.has('file')).toBe(false);
  });

  it('patchToolkitItem — PATCHes multipart and forwards the ETag as If-Match', async () => {
    // Arrange
    const request: ToolkitItemPatchRequest = { name: 'Y', ifMatch: 'etag==' };

    // Act
    await patchToolkitItem(ITEM, request, null);

    // Assert
    const opts = mockedApiFetch.mock.calls[0]?.[1];
    expect(mockedApiFetch.mock.calls[0]?.[0]).toBe(`/v1/toolkit/${ITEM}`);
    expect(opts?.method).toBe('PATCH');
    expect(opts?.ifMatch).toBe('etag==');
  });

  it('downloadToolkitAttachment — fetches the item file as a blob', async () => {
    // Act
    await downloadToolkitAttachment(ITEM);

    // Assert
    expect(mockedApiFetchBlob).toHaveBeenCalledWith(`/v1/toolkit/${ITEM}/attachment`, undefined);
  });
});
