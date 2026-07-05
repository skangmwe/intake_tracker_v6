// Tests for the Attachments card (S4/S5 Attachments tab). The API boundary is mocked;
// renderWithProviders hosts the queries and the real hooks (uploader included). Covers: loading /
// error / empty / list states, native download + external-link open, upload success (tracker clears,
// list refetches), upload failure + retry, remove, and the attach-link form (validation + submit) —
// each meaningful rendered state under jest-axe.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { AttachmentDto, AttachmentId, RecordId } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import * as api from './api';
import { AttachmentsCard } from './AttachmentsCard';

expect.extend(toHaveNoViolations);
jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const RECORD = 'AIS-00000001' as RecordId;

function buildAttachment(overrides: Partial<AttachmentDto> = {}): AttachmentDto {
  return {
    id: '11111111-1111-4111-8111-111111111111' as AttachmentId,
    recordId: RECORD,
    objectType: 'Request',
    fileName: 'brief.pdf',
    contentType: 'application/pdf',
    sizeBytes: 2048,
    isLink: false,
    uploadedAt: '2026-07-05T10:00:00Z',
    uploadedBy: '00000000-0000-0000-0000-000000000001' as AttachmentDto['uploadedBy'],
    contentUrl: '/api/v1/attachments/11111111-1111-4111-8111-111111111111/content',
    ...overrides,
  };
}

function buildLink(overrides: Partial<AttachmentDto> = {}): AttachmentDto {
  return buildAttachment({
    id: '22222222-2222-4222-8222-222222222222' as AttachmentId,
    fileName: 'Design spec',
    isLink: true,
    externalUrl: 'https://example.com/spec',
    sizeBytes: 0,
    ...overrides,
  });
}

function makeFile(name: string): File {
  return new File(['data'], name, { type: 'application/pdf' });
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:x') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  window.open = jest.fn();
});

describe('AttachmentsCard', () => {
  it('AttachmentsCard — empty state when the record has no attachments', async () => {
    // Arrange
    mockedApi.fetchRecordAttachments.mockResolvedValue([]);

    // Act
    const { container } = renderWithProviders(<AttachmentsCard recordId={RECORD} />);

    // Assert
    expect(await screen.findByText('No attachments yet.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AttachmentsCard — loading state announces while the list resolves', async () => {
    // Arrange — a never-settling fetch keeps the card in its loading state.
    mockedApi.fetchRecordAttachments.mockReturnValue(new Promise(() => undefined));

    // Act
    const { container } = renderWithProviders(<AttachmentsCard recordId={RECORD} />);

    // Assert
    expect(screen.getByText('Loading attachments…')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AttachmentsCard — error state surfaces a recovery message', async () => {
    // Arrange
    mockedApi.fetchRecordAttachments.mockRejectedValue(new Error('boom'));

    // Act
    const { container } = renderWithProviders(<AttachmentsCard recordId={RECORD} />);

    // Assert
    expect(await screen.findByText(/Attachments couldn’t be loaded/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AttachmentsCard — lists a file with its size and a link', async () => {
    // Arrange
    mockedApi.fetchRecordAttachments.mockResolvedValue([buildAttachment(), buildLink()]);

    // Act
    const { container } = renderWithProviders(<AttachmentsCard recordId={RECORD} />);

    // Assert
    expect(await screen.findByText('brief.pdf')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
    expect(screen.getByText('Design spec')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('AttachmentsCard — clicking a file downloads it via the authenticated endpoint', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchRecordAttachments.mockResolvedValue([buildAttachment()]);
    mockedApi.fetchAttachmentContent.mockResolvedValue(new Blob(['x']));
    renderWithProviders(<AttachmentsCard recordId={RECORD} />);
    await screen.findByText('brief.pdf');

    // Act — the exact name targets the open control, not the "Remove brief.pdf" button.
    await user.click(screen.getByRole('button', { name: 'brief.pdf' }));

    // Assert — the bytes are fetched with the token (never a bare <a href>).
    await waitFor(() =>
      expect(mockedApi.fetchAttachmentContent).toHaveBeenCalledWith(buildAttachment().id),
    );
  });

  it('AttachmentsCard — clicking a link opens the external URL in a new tab', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchRecordAttachments.mockResolvedValue([buildLink()]);
    renderWithProviders(<AttachmentsCard recordId={RECORD} />);
    await screen.findByText('Design spec');

    // Act — the exact name targets the open control, not the "Remove Design spec" button.
    await user.click(screen.getByRole('button', { name: 'Design spec' }));

    // Assert — links open directly; the content endpoint is never hit.
    expect(window.open).toHaveBeenCalledWith('https://example.com/spec', '_blank', 'noopener,noreferrer');
    expect(mockedApi.fetchAttachmentContent).not.toHaveBeenCalled();
  });

  it('AttachmentsCard — uploading a file stores it and refetches the list', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchRecordAttachments.mockResolvedValue([]);
    mockedApi.uploadAttachment.mockResolvedValue(buildAttachment());
    renderWithProviders(<AttachmentsCard recordId={RECORD} />);
    await screen.findByText('No attachments yet.');

    // Act
    await user.upload(screen.getByLabelText('Choose files to upload'), makeFile('brief.pdf'));

    // Assert — the file uploads, the tracker clears, and the list refetches.
    await waitFor(() => expect(mockedApi.uploadAttachment).toHaveBeenCalledWith(RECORD, expect.any(File)));
    await waitFor(() => expect(mockedApi.fetchRecordAttachments).toHaveBeenCalledTimes(2));
  });

  it('AttachmentsCard — shows an in-flight row while an upload is pending', async () => {
    // Arrange — a never-settling upload keeps the item in its "uploading" state.
    const user = userEvent.setup();
    mockedApi.fetchRecordAttachments.mockResolvedValue([]);
    mockedApi.uploadAttachment.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<AttachmentsCard recordId={RECORD} />);
    await screen.findByText('No attachments yet.');

    // Act
    await user.upload(screen.getByLabelText('Choose files to upload'), makeFile('brief.pdf'));

    // Assert — the per-file progress row announces the in-flight upload.
    expect(await screen.findByText('Uploading…')).toBeInTheDocument();
    expect(screen.getByText('brief.pdf')).toBeInTheDocument();
  });

  it('AttachmentsCard — a failed download surfaces an inline message', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchRecordAttachments.mockResolvedValue([buildAttachment()]);
    mockedApi.fetchAttachmentContent.mockRejectedValue(new Error('offline'));
    renderWithProviders(<AttachmentsCard recordId={RECORD} />);
    await screen.findByText('brief.pdf');

    // Act
    await user.click(screen.getByRole('button', { name: 'brief.pdf' }));

    // Assert
    expect(await screen.findByText('Couldn’t open')).toBeInTheDocument();
  });

  it('AttachmentsCard — a failed upload shows Retry and re-uploads on click', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchRecordAttachments.mockResolvedValue([]);
    mockedApi.uploadAttachment.mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce(buildAttachment());
    const { container } = renderWithProviders(<AttachmentsCard recordId={RECORD} />);
    await screen.findByText('No attachments yet.');

    // Act — the first upload fails.
    await user.upload(screen.getByLabelText('Choose files to upload'), makeFile('brief.pdf'));
    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    // Act — retry succeeds.
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    // Assert
    await waitFor(() => expect(mockedApi.uploadAttachment).toHaveBeenCalledTimes(2));
  });

  it('AttachmentsCard — removing an attachment calls the delete API', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchRecordAttachments.mockResolvedValue([buildAttachment()]);
    mockedApi.removeAttachment.mockResolvedValue(undefined);
    renderWithProviders(<AttachmentsCard recordId={RECORD} />);
    await screen.findByText('brief.pdf');

    // Act
    await user.click(screen.getByRole('button', { name: 'Remove brief.pdf' }));

    // Assert
    await waitFor(() => expect(mockedApi.removeAttachment).toHaveBeenCalledWith(buildAttachment().id));
    await waitFor(() => expect(mockedApi.fetchRecordAttachments).toHaveBeenCalledTimes(2));
  });

  it('AttachmentsCard — the link form validates then attaches an external URL', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchRecordAttachments.mockResolvedValue([]);
    mockedApi.attachExternalLink.mockResolvedValue(buildLink());
    const { container } = renderWithProviders(<AttachmentsCard recordId={RECORD} />);
    await screen.findByText('No attachments yet.');

    // Act — open the form and submit empty first (validation), then fill it in.
    await user.click(screen.getByRole('button', { name: 'Attach a link' }));
    await user.click(screen.getByRole('button', { name: 'Attach link' }));
    expect(await screen.findByText('Enter a link.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.type(screen.getByRole('textbox', { name: 'Link URL' }), 'https://example.com/spec');
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Design spec');
    await user.click(screen.getByRole('button', { name: 'Attach link' }));

    // Assert
    expect(mockedApi.attachExternalLink).toHaveBeenCalledWith(RECORD, {
      url: 'https://example.com/spec',
      title: 'Design spec',
    });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Link URL' })).not.toBeInTheDocument());
  });
});

describe('AttachmentsCard rendering scope', () => {
  it('AttachmentsCard — the drop zone exposes an accessible file input', async () => {
    // Arrange
    mockedApi.fetchRecordAttachments.mockResolvedValue([]);

    // Act
    const { container } = renderWithProviders(<AttachmentsCard recordId={RECORD} />);
    await screen.findByText('No attachments yet.');

    // Assert — the hidden input carries an accessible name (never a placeholder-only control).
    const region = within(container);
    expect(region.getByLabelText('Choose files to upload')).toBeInTheDocument();
  });
});
