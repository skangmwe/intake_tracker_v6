// Tests for ExportWizard — the Export tab's object → fields → download flow. The io-object catalog and
// the export mutation are mocked at the hook boundary. Covers the loading / error / empty states, the
// happy-path stepping + export call, and jest-axe across meaningfully different states.

import { axe } from 'jest-axe';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { IoObjectDto, WorkspaceId } from '@shared/types';

import { useExportObject, useIoObjects } from '../useImportExport';
import { ExportWizard } from './ExportWizard';

jest.mock('../useImportExport');

const mockedIoObjects = useIoObjects as jest.MockedFunction<typeof useIoObjects>;
const mockedExport = useExportObject as jest.MockedFunction<typeof useExportObject>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;

const REQUEST: IoObjectDto = {
  objectType: 'Request',
  label: 'Requests',
  canImport: true,
  canExport: true,
  canUpsert: false,
  importFields: [],
  exportFields: [
    { key: 'id', label: 'Record ID', alwaysIncluded: true },
    { key: 'name', label: 'Name' },
    { key: 'stage', label: 'Stage' },
  ],
};

const FEATURE: IoObjectDto = {
  objectType: 'Feature',
  label: 'Features',
  canImport: true,
  canExport: true,
  canUpsert: false,
  importFields: [],
  exportFields: [
    { key: 'id', label: 'Record ID', alwaysIncluded: true },
    { key: 'name', label: 'Name' },
    { key: 'oneLiner', label: 'One-liner' },
  ],
};

function availableList() {
  return screen.getByRole('listbox', { name: /available/i });
}
function selectedList() {
  return screen.getByRole('listbox', { name: /selected/i });
}

function mockObjects(state: { data?: IoObjectDto[]; isLoading?: boolean; isError?: boolean }) {
  mockedIoObjects.mockReturnValue({
    data: state.data,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
  } as ReturnType<typeof useIoObjects>);
}

function mockExport(overrides: Partial<ReturnType<typeof useExportObject>> = {}) {
  mockedExport.mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useExportObject>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockExport();
});

describe('ExportWizard', () => {
  it('ExportWizard — loading — shows a status and no axe violations', async () => {
    mockObjects({ isLoading: true });
    const { container } = render(<ExportWizard workspaceId={WORKSPACE} />);
    expect(screen.getByText('Loading objects…')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ExportWizard — error — shows an alert', async () => {
    mockObjects({ isError: true });
    const { container } = render(<ExportWizard workspaceId={WORKSPACE} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ExportWizard — no exportable objects — shows the empty state', async () => {
    mockObjects({ data: [{ ...REQUEST, canExport: false }] });
    const { container } = render(<ExportWizard workspaceId={WORKSPACE} />);
    expect(screen.getByText(/No objects are available to export/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ExportWizard — object → fields → download — exports the chosen columns', async () => {
    // Arrange
    const mutate = jest.fn();
    mockObjects({ data: [REQUEST] });
    mockExport({ mutate } as Partial<ReturnType<typeof useExportObject>>);
    const { container } = render(<ExportWizard workspaceId={WORKSPACE} />);

    // Act — step to fields, move Name into Selected via the transfer, step to download, export.
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await axe(container)).toHaveNoViolations(); // fields step
    await userEvent.dblClick(within(availableList()).getByText('Name'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    // Assert — identity id is implicit; the chosen "name" is sent.
    expect(mutate).toHaveBeenCalledWith({ objectType: 'Request', fieldKeys: ['name'] });
  });

  it('ExportWizard — Feature lights up from the catalog — exports Feature columns', async () => {
    // Arrange — the catalog carries both Request and Feature; the wizard is object-agnostic, so Feature
    // is selectable with its own fields once the descriptor is registered.
    const mutate = jest.fn();
    mockObjects({ data: [REQUEST, FEATURE] });
    mockExport({ mutate } as Partial<ReturnType<typeof useExportObject>>);
    const { container } = render(<ExportWizard workspaceId={WORKSPACE} />);

    // Act — choose Feature, step to its fields, move "One-liner" into Selected, download.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Object to export' }), 'Feature');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await axe(container)).toHaveNoViolations(); // Feature fields step
    await userEvent.dblClick(within(availableList()).getByText('One-liner'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    // Assert — the Feature object + its chosen column are sent (identity id is implicit).
    expect(mutate).toHaveBeenCalledWith({ objectType: 'Feature', fieldKeys: ['oneLiner'] });
  });

  it('ExportWizard — reordered selection — exports fieldKeys in Selected order', async () => {
    // Arrange — Request carries two orderable fields (name, stage) beyond its locked identity column.
    const mutate = jest.fn();
    mockObjects({ data: [REQUEST] });
    mockExport({ mutate } as Partial<ReturnType<typeof useExportObject>>);
    render(<ExportWizard workspaceId={WORKSPACE} />);

    // Act — step to Fields, move Name then Stage into Selected (Selected order: [name, stage]).
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.dblClick(within(availableList()).getByText('Name'));
    await userEvent.dblClick(within(availableList()).getByText('Stage'));

    // Act — reorder: focus Name (currently first) and push it down one, past Stage, via the
    // transfer's keyboard-accessible reorder (Alt+ArrowDown) — Selected order becomes [stage, name].
    const name = within(selectedList()).getByText('Name');
    name.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');

    // Act — step to Download, export.
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    // Assert — fieldKeys reflect the reordered Selected order, not the order fields were added.
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ objectType: 'Request', fieldKeys: ['stage', 'name'] }),
    );
  });

  it('ExportWizard — export success — shows the downloaded note', async () => {
    mockObjects({ data: [REQUEST] });
    mockExport({ isSuccess: true } as Partial<ReturnType<typeof useExportObject>>);
    render(<ExportWizard workspaceId={WORKSPACE} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Your export has downloaded.')).toBeInTheDocument();
  });
});
