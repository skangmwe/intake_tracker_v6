// Unit tests for the Toolkit detail sheet — loading / error / loaded states, copy-content, download,
// and Edit. useToolkitItem, the download API, and saveBlob are mocked at the boundary; jest-axe runs
// against the loaded state (the meaningfully different rendered content).

import { axe } from 'jest-axe';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ToolkitItemDto, ToolkitItemId, UserId, WorkspaceId } from '@shared/types';

import { downloadToolkitAttachment } from '../api';
import { useToolkitItem } from '../useToolkit';
import { ToolkitDetailSheet } from './ToolkitDetailSheet';

jest.mock('../useToolkit');
jest.mock('../api');
jest.mock('@/shared/http/download', () => ({ saveBlob: jest.fn() }));

const mockedUseItem = useToolkitItem as jest.MockedFunction<typeof useToolkitItem>;
const mockedDownload = downloadToolkitAttachment as jest.MockedFunction<typeof downloadToolkitAttachment>;

const ITEM = 'AIS-00000073' as ToolkitItemId;
const writeText = jest.fn(() => Promise.resolve());

function item(overrides: Partial<ToolkitItemDto> = {}): ToolkitItemDto {
  return {
    id: ITEM,
    workspaceId: 'ws-1' as WorkspaceId,
    kind: 'Prompt',
    status: 'Active',
    name: 'Clause extraction prompt',
    oneLiner: 'Pulls structured clauses out of contracts',
    description: 'Vetted prompt template.',
    maintainer: 'Mia Chen',
    howTo: 'Fill the variables and run.',
    bodyMarkdown: 'You are a contracts analyst...',
    attachment: null,
    lastModifiedAt: '2026-07-02T10:00:00Z',
    lastModifiedBy: 'Mia Chen' as UserId,
    createdAt: '2026-06-01T10:00:00Z',
    createdBy: 'Mia Chen' as UserId,
    isRetired: false,
    eTag: 'etag==',
    ...overrides,
  };
}

function stub(overrides: Partial<ReturnType<typeof useToolkitItem>>) {
  mockedUseItem.mockReturnValue({ data: undefined, isLoading: false, isError: false, ...overrides } as ReturnType<typeof useToolkitItem>);
}

beforeAll(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true }));
beforeEach(() => jest.clearAllMocks());

describe('ToolkitDetailSheet', () => {
  it('ToolkitDetailSheet — loading — shows a loading status', () => {
    // Arrange
    stub({ isLoading: true });

    // Act
    render(<ToolkitDetailSheet itemId={ITEM} onClose={jest.fn()} onEdit={jest.fn()} />);

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('Loading item');
  });

  it('ToolkitDetailSheet — error — shows an error alert', () => {
    // Arrange
    stub({ isError: true });

    // Act
    render(<ToolkitDetailSheet itemId={ITEM} onClose={jest.fn()} onEdit={jest.fn()} />);

    // Assert
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('ToolkitDetailSheet — loaded — copy-content writes the body to the clipboard', async () => {
    // Arrange
    stub({ data: item() });
    render(<ToolkitDetailSheet itemId={ITEM} onClose={jest.fn()} onEdit={jest.fn()} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: /copy content/i }));

    // Assert
    expect(writeText).toHaveBeenCalledWith('You are a contracts analyst...');
    await waitFor(() => expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument());
  });

  it('ToolkitDetailSheet — loaded — Edit invokes onEdit with the item', async () => {
    // Arrange
    const onEdit = jest.fn();
    stub({ data: item() });
    render(<ToolkitDetailSheet itemId={ITEM} onClose={jest.fn()} onEdit={onEdit} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));

    // Assert
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: ITEM }));
  });

  it('ToolkitDetailSheet — loaded with attachment — download fetches and saves the file', async () => {
    // Arrange
    mockedDownload.mockResolvedValue(new Blob(['x']));
    stub({
      data: item({ attachment: { fileName: 'playbook.pdf', contentType: 'application/pdf', sizeBytes: 10, downloadUrl: '/x' } }),
    });
    render(<ToolkitDetailSheet itemId={ITEM} onClose={jest.fn()} onEdit={jest.fn()} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: /download/i }));

    // Assert
    await waitFor(() => expect(mockedDownload).toHaveBeenCalledWith(ITEM));
  });

  it('ToolkitDetailSheet — loaded — no axe violations', async () => {
    // Arrange
    stub({ data: item() });
    const { container } = render(<ToolkitDetailSheet itemId={ITEM} onClose={jest.fn()} onEdit={jest.fn()} />);

    // Act + Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});
