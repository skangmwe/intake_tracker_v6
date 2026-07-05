// Tests for the attachments api wrappers — verifies each builds the right path / method / body over
// the shared client. The client itself (apiFetch / apiFetchBlob) is mocked; its own behaviour is
// covered in shared/http/apiClient.test.ts.

import type { AttachmentId, RecordId } from '@shared/types';

import { apiFetch, apiFetchBlob } from '@/shared/http/apiClient';

import {
  attachExternalLink,
  fetchAttachmentContent,
  fetchRecordAttachments,
  removeAttachment,
  uploadAttachment,
} from './api';

jest.mock('@/shared/http/apiClient');
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockedBlob = apiFetchBlob as jest.MockedFunction<typeof apiFetchBlob>;

const RECORD = 'AIS-00000001' as RecordId;
const ATT = '11111111-1111-4111-8111-111111111111' as AttachmentId;

beforeEach(() => jest.clearAllMocks());

describe('attachments api', () => {
  it('fetchRecordAttachments — GETs the record attachments and passes the abort signal', async () => {
    // Arrange
    mockedFetch.mockResolvedValue([]);
    const controller = new AbortController();

    // Act
    await fetchRecordAttachments(RECORD, controller.signal);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/records/${RECORD}/attachments`, { signal: controller.signal });
  });

  it('fetchRecordAttachments — omits the signal option when none is given', async () => {
    // Arrange
    mockedFetch.mockResolvedValue([]);

    // Act
    await fetchRecordAttachments(RECORD);

    // Assert — the no-signal branch passes an empty options object.
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/records/${RECORD}/attachments`, {});
  });

  it('uploadAttachment — POSTs multipart form data with the file field', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({} as never);
    const file = new File(['x'], 'brief.pdf', { type: 'application/pdf' });

    // Act
    await uploadAttachment(RECORD, file);

    // Assert
    const [path, opts] = mockedFetch.mock.calls[0];
    expect(path).toBe(`/v1/records/${RECORD}/attachments`);
    expect(opts).toMatchObject({ method: 'POST' });
    expect((opts as { body: FormData }).body).toBeInstanceOf(FormData);
    expect((opts as { body: FormData }).body.get('file')).toBeInstanceOf(File);
  });

  it('attachExternalLink — POSTs the link request as JSON', async () => {
    // Arrange
    mockedFetch.mockResolvedValue({} as never);

    // Act
    await attachExternalLink(RECORD, { url: 'https://x', title: 'Spec' });

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/records/${RECORD}/attachments/link`, {
      method: 'POST',
      body: { url: 'https://x', title: 'Spec' },
    });
  });

  it('removeAttachment — DELETEs the attachment', async () => {
    // Arrange
    mockedFetch.mockResolvedValue(undefined);

    // Act
    await removeAttachment(ATT);

    // Assert
    expect(mockedFetch).toHaveBeenCalledWith(`/v1/attachments/${ATT}`, { method: 'DELETE' });
  });

  it('fetchAttachmentContent — fetches the content blob with an optional signal', async () => {
    // Arrange
    mockedBlob.mockResolvedValue(new Blob(['x']));
    const controller = new AbortController();

    // Act
    await fetchAttachmentContent(ATT, controller.signal);

    // Assert
    expect(mockedBlob).toHaveBeenCalledWith(`/v1/attachments/${ATT}/content`, controller.signal);
  });
});
