import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { WorkspaceId } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { SavedViewEditor } from './SavedViewEditor';
import { useCreateSavedView, useUpdateSavedView } from '../useSavedViews';

jest.mock('../useSavedViews');

const mockedCreate = useCreateSavedView as jest.MockedFunction<typeof useCreateSavedView>;
const mockedUpdate = useUpdateSavedView as jest.MockedFunction<typeof useUpdateSavedView>;

const createMutate = jest.fn();
const updateMutate = jest.fn();

function mutation(mutate: jest.Mock): unknown {
  return { mutate, isPending: false, isError: false };
}

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'stage', label: 'Stage' },
];

function renderEditor(props: Partial<Parameters<typeof SavedViewEditor>[0]> = {}) {
  return renderWithProviders(
    <SavedViewEditor
      workspaceId={'ws-1' as WorkspaceId}
      objectType="Request"
      availableColumns={COLUMNS}
      defaultColumns={['name', 'stage']}
      editingView={null}
      canShare
      onClose={jest.fn()}
      {...props}
    />,
  );
}

describe('SavedViewEditor', () => {
  beforeEach(() => {
    mockedCreate.mockReturnValue(mutation(createMutate) as ReturnType<typeof useCreateSavedView>);
    mockedUpdate.mockReturnValue(mutation(updateMutate) as ReturnType<typeof useUpdateSavedView>);
  });
  afterEach(() => jest.clearAllMocks());

  it('SavedViewEditor — renders the create dialog with tabs and no a11y violations', async () => {
    // Act
    const { container } = renderEditor();

    // Assert
    expect(screen.getByRole('dialog', { name: 'New saved view' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Fields' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sort' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SavedViewEditor — Save is disabled until a name is entered, then creates the view', async () => {
    // Arrange
    const user = userEvent.setup();
    renderEditor();
    const save = screen.getByRole('button', { name: 'Save view' });

    // Assert — disabled with no name
    expect(save).toBeDisabled();

    // Act — name it, then save
    await user.type(screen.getByLabelText('View name'), 'My work');
    await user.click(save);

    // Assert
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      name: 'My work',
      objectType: 'Request',
      scope: 'personal',
    });
  });

  it('SavedViewEditor — Escape closes the sheet', async () => {
    // Arrange
    const onClose = jest.fn();
    const user = userEvent.setup();
    renderEditor({ onClose });

    // Act
    await user.keyboard('{Escape}');

    // Assert
    expect(onClose).toHaveBeenCalled();
  });

  it('SavedViewEditor — the shared scope is disabled when the caller cannot share', () => {
    // Act
    renderEditor({ canShare: false });

    // Assert
    expect(screen.getByRole('radio', { name: 'Shared' })).toBeDisabled();
  });
});
