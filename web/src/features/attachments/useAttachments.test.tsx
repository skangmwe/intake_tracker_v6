// Tests for the attachments hooks + helpers (web-testing.md). Covers the concurrency-limited
// uploader (cap, success clears the tracker, failure → retry, dismiss), saveAttachment (link opens a
// tab; native fetches bytes and saves a Blob), and formatBytes. The API boundary is mocked; a local
// QueryClient wrapper hosts the hook (renderHook may keep its own wrapper per web-testing.md).

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { AttachmentDto, AttachmentId, RecordId } from '@shared/types';

import * as api from './api';
import { formatBytes } from './AttachmentsCard';
import { MAX_CONCURRENT_UPLOADS, saveAttachment, useAttachmentUploader, useRecordAttachments } from './useAttachments';

jest.mock('./api');
const mockedApi = api as jest.Mocked<typeof api>;
const RECORD = 'AIS-00000001' as RecordId;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function makeFile(name: string): File {
  return new File(['data'], name, { type: 'application/pdf' });
}

describe('useRecordAttachments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('useRecordAttachments — is disabled and never fetches when the record id is undefined', () => {
    // Act
    const { result } = renderHook(() => useRecordAttachments(undefined), { wrapper });

    // Assert — the query stays idle (the disabled-key branch), so no request goes out.
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.fetchRecordAttachments).not.toHaveBeenCalled();
  });
});

describe('useAttachmentUploader', () => {
  beforeEach(() => jest.clearAllMocks());

  it('useAttachmentUploader — runs at most MAX_CONCURRENT_UPLOADS at once, queueing the rest', async () => {
    // Arrange — each upload parks until its resolver is called, so we can control the pipeline.
    const resolvers: Array<() => void> = [];
    mockedApi.uploadAttachment.mockImplementation(
      () => new Promise<AttachmentDto>((res) => resolvers.push(() => res({} as AttachmentDto))),
    );
    const { result } = renderHook(() => useAttachmentUploader(RECORD), { wrapper });

    // Act
    act(() => result.current.enqueue(Array.from({ length: 7 }, (_unused, index) => makeFile(`f${index}.pdf`))));

    // Assert — only the cap is in flight; the rest wait.
    expect(mockedApi.uploadAttachment).toHaveBeenCalledTimes(MAX_CONCURRENT_UPLOADS);
    expect(result.current.items).toHaveLength(7);

    // Act — finishing one frees a slot for the next queued file.
    const releaseFirst = resolvers.shift();
    await act(async () => {
      releaseFirst?.();
      await Promise.resolve();
    });

    // Assert
    await waitFor(() => expect(mockedApi.uploadAttachment).toHaveBeenCalledTimes(MAX_CONCURRENT_UPLOADS + 1));
  });

  it('useAttachmentUploader — a successful upload drops out of the tracker', async () => {
    // Arrange
    mockedApi.uploadAttachment.mockResolvedValue({} as AttachmentDto);
    const { result } = renderHook(() => useAttachmentUploader(RECORD), { wrapper });

    // Act
    await act(async () => {
      result.current.enqueue([makeFile('one.pdf')]);
    });

    // Assert — the stored file leaves the tracker (it reappears in the invalidated list).
    await waitFor(() => expect(result.current.items).toHaveLength(0));
  });

  it('useAttachmentUploader — a failed upload stays as failed and retries on demand', async () => {
    // Arrange
    mockedApi.uploadAttachment.mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce({} as AttachmentDto);
    const { result } = renderHook(() => useAttachmentUploader(RECORD), { wrapper });

    // Act — first attempt fails.
    await act(async () => {
      result.current.enqueue([makeFile('one.pdf')]);
    });
    await waitFor(() => expect(result.current.items[0]?.status).toBe('failed'));

    // Act — retry the same item.
    const failedId = result.current.items[0]?.id;
    if (!failedId) throw new Error('expected a failed item to retry');
    await act(async () => {
      result.current.retry(failedId);
    });

    // Assert — the retry re-uploads and, on success, clears the tracker.
    await waitFor(() => expect(mockedApi.uploadAttachment).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.items).toHaveLength(0));
  });

  it('useAttachmentUploader — dismiss removes a failed item from the tracker', async () => {
    // Arrange
    mockedApi.uploadAttachment.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useAttachmentUploader(RECORD), { wrapper });
    await act(async () => {
      result.current.enqueue([makeFile('one.pdf')]);
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    // Act
    const id = result.current.items[0]?.id;
    if (!id) throw new Error('expected an item to dismiss');
    act(() => result.current.dismiss(id));

    // Assert
    expect(result.current.items).toHaveLength(0);
  });
});

describe('saveAttachment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:x') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    window.open = jest.fn();
  });

  function link(): AttachmentDto {
    return {
      id: 'l1' as AttachmentId,
      recordId: RECORD,
      objectType: 'Request',
      fileName: 'Spec',
      contentType: 'text/uri-list',
      sizeBytes: 0,
      isLink: true,
      externalUrl: 'https://example.com/spec',
      uploadedAt: '2026-07-05T10:00:00Z',
      uploadedBy: '00000000-0000-0000-0000-000000000001' as AttachmentDto['uploadedBy'],
      contentUrl: '/api/v1/attachments/l1/content',
    };
  }

  it('saveAttachment — a link opens in a new tab and never fetches content', async () => {
    // Act
    await saveAttachment(link());

    // Assert
    expect(window.open).toHaveBeenCalledWith('https://example.com/spec', '_blank', 'noopener,noreferrer');
    expect(mockedApi.fetchAttachmentContent).not.toHaveBeenCalled();
  });

  it('saveAttachment — a link without a URL is a no-op', async () => {
    // Arrange — defensive: a malformed link row (isLink but no externalUrl) opens nothing.
    const { externalUrl: _external, ...base } = link();

    // Act
    await saveAttachment({ ...base, isLink: true });

    // Assert
    expect(window.open).not.toHaveBeenCalled();
    expect(mockedApi.fetchAttachmentContent).not.toHaveBeenCalled();
  });

  it('saveAttachment — a native file is fetched authenticated and saved as a Blob', async () => {
    // Arrange — a native attachment carries no externalUrl (exactOptionalPropertyTypes: omit, not undefined).
    mockedApi.fetchAttachmentContent.mockResolvedValue(new Blob(['x']));
    const { externalUrl: _external, ...base } = link();
    const native: AttachmentDto = { ...base, isLink: false, fileName: 'brief.pdf' };

    // Act
    await saveAttachment(native);

    // Assert
    expect(mockedApi.fetchAttachmentContent).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '—'],
    [512, '512 B'],
    [2048, '2 KB'],
    [1_572_864, '1.5 MB'],
  ])('formatBytes — %i bytes → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
