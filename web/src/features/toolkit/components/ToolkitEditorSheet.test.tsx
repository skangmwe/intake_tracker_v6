// Unit tests for the Toolkit editor sheet — create validation (name required), create submit, edit
// prefill + submit, and axe. useToolkitItem + the create/update mutations are mocked at the boundary.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ToolkitItemDto, ToolkitItemId, UserId, WorkspaceId } from '@shared/types';

import { useCreateToolkitItem, useToolkitItem, useUpdateToolkitItem } from '../useToolkit';
import { ToolkitEditorSheet } from './ToolkitEditorSheet';

jest.mock('../useToolkit');

const mockedUseItem = useToolkitItem as jest.MockedFunction<typeof useToolkitItem>;
const mockedUseCreate = useCreateToolkitItem as jest.MockedFunction<typeof useCreateToolkitItem>;
const mockedUseUpdate = useUpdateToolkitItem as jest.MockedFunction<typeof useUpdateToolkitItem>;

const WS = 'ws-1' as WorkspaceId;
const ITEM = 'AIS-00000073' as ToolkitItemId;

const createMutate = jest.fn();
const updateMutate = jest.fn();

function mutationStub(mutate: jest.Mock) {
  return { mutate, isPending: false, isError: false } as unknown as ReturnType<typeof useCreateToolkitItem>;
}

function existing(): ToolkitItemDto {
  return {
    id: ITEM,
    workspaceId: WS,
    kind: 'Prompt',
    status: 'Active',
    name: 'Existing prompt',
    oneLiner: 'A summary',
    description: 'Desc',
    maintainer: 'Mia Chen',
    howTo: 'Use it',
    bodyMarkdown: 'body',
    attachment: null,
    lastModifiedAt: '2026-07-02T10:00:00Z',
    lastModifiedBy: 'Mia Chen' as UserId,
    createdAt: '2026-06-01T10:00:00Z',
    createdBy: 'Mia Chen' as UserId,
    isRetired: false,
    eTag: 'etag==',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseCreate.mockReturnValue(mutationStub(createMutate));
  mockedUseUpdate.mockReturnValue(mutationStub(updateMutate) as ReturnType<typeof useUpdateToolkitItem>);
  mockedUseItem.mockReturnValue({ data: undefined } as ReturnType<typeof useToolkitItem>);
});

describe('ToolkitEditorSheet', () => {
  it('ToolkitEditorSheet — create with empty name — shows an error and does not submit', async () => {
    // Arrange
    render(<ToolkitEditorSheet workspaceId={WS} editItemId={null} onClose={jest.fn()} onSaved={jest.fn()} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Create item' }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name');
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('ToolkitEditorSheet — create with a name — submits the create mutation', async () => {
    // Arrange
    render(<ToolkitEditorSheet workspaceId={WS} editItemId={null} onClose={jest.fn()} onSaved={jest.fn()} />);

    // Act
    await userEvent.type(screen.getByLabelText('Name'), 'New prompt');
    await userEvent.click(screen.getByRole('button', { name: 'Create item' }));

    // Assert
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ request: expect.objectContaining({ name: 'New prompt', kind: 'Playbook' }) }),
      expect.anything(),
    );
  });

  it('ToolkitEditorSheet — edit — prefills from the loaded item and submits the update mutation', async () => {
    // Arrange
    mockedUseItem.mockReturnValue({ data: existing() } as ReturnType<typeof useToolkitItem>);
    render(<ToolkitEditorSheet workspaceId={WS} editItemId={ITEM} onClose={jest.fn()} onSaved={jest.fn()} />);

    // Assert prefill
    expect(screen.getByLabelText('Name')).toHaveValue('Existing prompt');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // Assert
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ request: expect.objectContaining({ ifMatch: 'etag==' }) }),
      expect.anything(),
    );
  });

  it('ToolkitEditorSheet — create — no axe violations', async () => {
    // Arrange
    const { container } = render(<ToolkitEditorSheet workspaceId={WS} editItemId={null} onClose={jest.fn()} onSaved={jest.fn()} />);

    // Act + Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});
