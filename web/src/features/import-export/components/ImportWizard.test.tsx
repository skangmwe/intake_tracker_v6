// Tests for ImportWizard — the Import tab's object → upload → map → review flow. The io-object catalog
// and the run-step hooks are mocked at the boundary. Covers loading / error / empty, CSV validation,
// the preview + auto-mapping, stepping through to the run step, and jest-axe across states.

import { axe } from 'jest-axe';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { IoObjectDto, WorkspaceId } from '@shared/types';

import { useImportStatus, useIoObjects, useStartImport } from '../useImportExport';
import { ImportWizard } from './ImportWizard';

jest.mock('../useImportExport');

const mockedIoObjects = useIoObjects as jest.MockedFunction<typeof useIoObjects>;
const mockedStart = useStartImport as jest.MockedFunction<typeof useStartImport>;
const mockedStatus = useImportStatus as jest.MockedFunction<typeof useImportStatus>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;

const REQUEST: IoObjectDto = {
  objectType: 'Request',
  label: 'Requests',
  canImport: true,
  canExport: true,
  canUpsert: false,
  importFields: [
    { key: 'name', label: 'Name', required: true },
    { key: 'description', label: 'Description' },
  ],
  exportFields: [],
};

const FEATURE: IoObjectDto = {
  objectType: 'Feature',
  label: 'Features',
  canImport: true,
  canExport: true,
  canUpsert: false,
  importFields: [
    { key: 'name', label: 'Name', required: true },
    { key: 'featureType', label: 'Type', required: true },
    { key: 'oneLiner', label: 'One-liner' },
  ],
  exportFields: [],
};

function mockObjects(state: { data?: IoObjectDto[]; isLoading?: boolean; isError?: boolean }) {
  mockedIoObjects.mockReturnValue({
    data: state.data,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
  } as ReturnType<typeof useIoObjects>);
}

function csvFile(content: string, name = 'import.csv') {
  return new File([content], name, { type: 'text/csv' });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedStart.mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useStartImport>);
  mockedStatus.mockReturnValue({ data: undefined, isError: false } as unknown as ReturnType<
    typeof useImportStatus
  >);
});

describe('ImportWizard', () => {
  it('ImportWizard — loading — shows a status and no axe violations', async () => {
    mockObjects({ isLoading: true });
    const { container } = render(<ImportWizard workspaceId={WORKSPACE} />);
    expect(screen.getByText('Loading objects…')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ImportWizard — error — shows an alert', () => {
    mockObjects({ isError: true });
    render(<ImportWizard workspaceId={WORKSPACE} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('ImportWizard — no importable objects — shows the empty state', async () => {
    mockObjects({ data: [{ ...REQUEST, canImport: false }] });
    const { container } = render(<ImportWizard workspaceId={WORKSPACE} />);
    expect(screen.getByText(/No objects are available to import/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ImportWizard — non-CSV file — rejects it before previewing', async () => {
    mockObjects({ data: [REQUEST] });
    render(<ImportWizard workspaceId={WORKSPACE} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await userEvent.upload(screen.getByLabelText('CSV file'), csvFile('x', 'data.txt'));

    expect(await screen.findByText('Choose a .csv file.')).toBeInTheDocument();
  });

  it('ImportWizard — upload → preview → map → review — reaches the run step', async () => {
    // Arrange
    mockObjects({ data: [REQUEST] });
    const { container } = render(<ImportWizard workspaceId={WORKSPACE} />);

    // Act — object → upload
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.upload(screen.getByLabelText('CSV file'), csvFile('Name,Owner\nAlpha,Alex\n'));

    // Assert — preview renders and auto-mapping is applied.
    expect(await screen.findByText(/Preview — first 1 row/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    // Act — upload → map
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('combobox', { name: /Map column Name/ })).toHaveValue('name');

    // Act — map → review
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Assert — the run step is showing.
    expect(screen.getByRole('button', { name: 'Run import' })).toBeInTheDocument();
  });

  it('ImportWizard — Feature lights up from the catalog — maps Feature fields to the run step', async () => {
    // Arrange — the catalog carries both Request and Feature; selecting Feature drives the mapper from
    // Feature's own import fields (name + type), proving the wizard is object-agnostic.
    mockObjects({ data: [REQUEST, FEATURE] });
    render(<ImportWizard workspaceId={WORKSPACE} />);

    // Act — choose Feature, upload a CSV whose headers match Feature's fields.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Object to import' }), 'Feature');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.upload(screen.getByLabelText('CSV file'), csvFile('Name,Type\nClause finder,Functional\n'));
    await screen.findByText(/Preview — first 1 row/);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Assert — the Feature-specific "Type" column auto-maps to featureType, and both required fields
    // being satisfied lets the flow reach the run step.
    expect(screen.getByRole('combobox', { name: /Map column Type/ })).toHaveValue('featureType');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('button', { name: 'Run import' })).toBeInTheDocument();
  });

  it('ImportWizard — required field unmapped — blocks continuing from the map step', async () => {
    // Arrange — a CSV whose only column does not auto-map to the required "name".
    mockObjects({ data: [REQUEST] });
    render(<ImportWizard workspaceId={WORKSPACE} />);

    // Act — object → upload a file with an unmatched column.
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.upload(screen.getByLabelText('CSV file'), csvFile('Mystery\nfoo\n'));
    await screen.findByText(/Preview — first 1 row/);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Assert — on the map step, Continue is disabled and the required-field hint shows.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled());
    expect(screen.getByText(/Map a column to: Name/)).toBeInTheDocument();
  });
});
