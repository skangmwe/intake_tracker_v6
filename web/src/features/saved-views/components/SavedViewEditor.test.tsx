import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { IsoDateTime, SavedViewDto, SavedViewId, UserId, WorkspaceId } from '@shared/types';

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

function buildView(overrides: Partial<SavedViewDto> = {}): SavedViewDto {
  return {
    id: 'sv-1' as SavedViewId,
    workspaceId: 'ws-1' as WorkspaceId,
    objectType: 'Request',
    name: 'My open work',
    scope: 'personal',
    isDefault: false,
    columns: ['name', 'stage'],
    filters: {},
    sort: [{ column: 'name', direction: 'asc' }],
    ownerUserId: 'u-1' as UserId,
    createdBy: 'u-1' as UserId,
    createdAt: '2026-07-01T00:00:00Z' as IsoDateTime,
    updatedAt: '2026-07-01T00:00:00Z' as IsoDateTime,
    ...overrides,
  };
}

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

  it('SavedViewEditor — edit flow prefills the name and updates on save', async () => {
    // Arrange
    const user = userEvent.setup();

    // Act
    renderEditor({ editingView: buildView({ name: 'Quarterly review' }) });

    // Assert — edit heading + prefilled name
    expect(screen.getByRole('dialog', { name: 'Edit view' })).toBeInTheDocument();
    expect(screen.getByLabelText('View name')).toHaveValue('Quarterly review');

    // Act — save routes through the update mutation with the view id
    await user.click(screen.getByRole('button', { name: 'Save view' }));

    // Assert
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0]![0]).toMatchObject({ savedViewId: 'sv-1' });
  });

  it('SavedViewEditor — clicking a tab reveals its panel', async () => {
    // Arrange
    const user = userEvent.setup();
    renderEditor();

    // Act + Assert
    await user.click(screen.getByRole('tab', { name: 'Fields' }));
    expect(screen.getByRole('tabpanel', { name: 'Fields' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Sort' }));
    expect(screen.getByRole('tabpanel', { name: 'Sort' })).toBeInTheDocument();
  });

  it('SavedViewEditor — arrow keys, Home and End move between tabs', async () => {
    // Arrange
    const user = userEvent.setup();
    renderEditor();
    screen.getByRole('tab', { name: 'Filters' }).focus();

    // Act + Assert — ArrowRight advances
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Fields' })).toHaveAttribute('aria-selected', 'true');

    // End jumps to the last tab
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Sort' })).toHaveAttribute('aria-selected', 'true');

    // Home jumps to the first
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Filters' })).toHaveAttribute('aria-selected', 'true');

    // ArrowLeft wraps to the last
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Sort' })).toHaveAttribute('aria-selected', 'true');
  });

  it('SavedViewEditor — a non-navigation key leaves the active tab unchanged', async () => {
    // Arrange
    const user = userEvent.setup();
    renderEditor();
    screen.getByRole('tab', { name: 'Filters' }).focus();

    // Act
    await user.keyboard('a');

    // Assert
    expect(screen.getByRole('tab', { name: 'Filters' })).toHaveAttribute('aria-selected', 'true');
  });

  it('SavedViewEditor — toggling shared scope and default flags them on the request', async () => {
    // Arrange
    const user = userEvent.setup();
    renderEditor();
    await user.type(screen.getByLabelText('View name'), 'Team view');

    // Act
    await user.click(screen.getByRole('radio', { name: 'Shared' }));
    await user.click(screen.getByLabelText('Default view'));
    await user.click(screen.getByRole('button', { name: 'Save view' }));

    // Assert
    expect(createMutate.mock.calls[0]![0]).toMatchObject({ scope: 'shared', isDefault: true });
  });

  it('SavedViewEditor — shows a saving state while the mutation is pending', () => {
    // Arrange — an in-flight update
    mockedUpdate.mockReturnValue({
      mutate: updateMutate,
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof useUpdateSavedView>);

    // Act
    renderEditor({ editingView: buildView() });

    // Assert
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('SavedViewEditor — surfaces an error alert when the save fails', () => {
    // Arrange — the create mutation reports an error
    mockedCreate.mockReturnValue({
      mutate: createMutate,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof useCreateSavedView>);

    // Act
    renderEditor();

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t be saved/i);
  });

  it('SavedViewEditor — calls onSaved and closes after a successful create', async () => {
    // Arrange — a local mutate that resolves via the onSuccess callback
    const saved = buildView();
    const mutate = jest.fn((_request: unknown, opts: { onSuccess: (view: SavedViewDto) => void }) =>
      opts.onSuccess(saved),
    );
    mockedCreate.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCreateSavedView>);
    const onSaved = jest.fn();
    const onClose = jest.fn();
    const user = userEvent.setup();
    renderEditor({ onSaved, onClose });

    // Act
    await user.type(screen.getByLabelText('View name'), 'Done');
    await user.click(screen.getByRole('button', { name: 'Save view' }));

    // Assert
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(onClose).toHaveBeenCalled();
  });
});
