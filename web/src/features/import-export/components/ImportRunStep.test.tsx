// Tests for ImportRunStep — the wizard's review + run step. The hooks are mocked at the boundary so the
// step's own behaviour is under test: the review summary, firing the mapped import, and rendering the
// status line + per-row report once a job is polled. jest-axe across the idle and result states.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ImportMode, ImportStatusDto, WorkspaceId } from '@shared/types';

import { useImportStatus, useStartImport } from '../useImportExport';
import { ImportRunStep } from './ImportRunStep';

jest.mock('../useImportExport');

const mockedStart = useStartImport as jest.MockedFunction<typeof useStartImport>;
const mockedStatus = useImportStatus as jest.MockedFunction<typeof useImportStatus>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;
const FILE = new File(['Name\nA'], 'import.csv', { type: 'text/csv' });
const MAPPING = [{ columnIndex: 0, fieldKey: 'name' }];

function mockStart(overrides: Partial<ReturnType<typeof useStartImport>> = {}) {
  mockedStart.mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useStartImport>);
}

function mockStatus(data?: ImportStatusDto, isError = false) {
  mockedStatus.mockReturnValue({ data, isError } as unknown as ReturnType<typeof useImportStatus>);
}

const JOB: ImportStatusDto = {
  id: 'imp-1' as ImportStatusDto['id'],
  workspaceId: WORKSPACE,
  startedBy: 'u-1' as ImportStatusDto['startedBy'],
  startedAt: '2026-07-06T10:00:00Z',
  status: 'CompletedWithErrors',
  totalRows: 3,
  landedRows: 2,
  createdRows: 2,
  updatedRows: 0,
  flaggedRows: [
    {
      rowIndex: 3,
      reasons: [{ code: 'missing-required', message: 'Name is required.', field: 'name' }],
    },
  ],
};

const COMPLETED_JOB: ImportStatusDto = {
  id: 'imp-2' as ImportStatusDto['id'],
  workspaceId: WORKSPACE,
  startedBy: 'u-1' as ImportStatusDto['startedBy'],
  startedAt: '2026-07-06T10:00:00Z',
  status: 'Completed',
  totalRows: 5,
  landedRows: 5,
  createdRows: 3,
  updatedRows: 2,
  flaggedRows: [],
};

beforeEach(() => jest.clearAllMocks());

function renderStep(mode: ImportMode = 'create') {
  return render(
    <ImportRunStep
      workspaceId={WORKSPACE}
      file={FILE}
      objectType="Request"
      objectLabel="Requests"
      mapping={MAPPING}
      mode={mode}
    />,
  );
}

describe('ImportRunStep', () => {
  it('ImportRunStep — idle — shows the review summary and a run button', async () => {
    // Arrange
    mockStart();
    mockStatus(undefined);

    // Act
    const { container } = renderStep();

    // Assert
    expect(screen.getByText(/import\.csv/)).toBeInTheDocument();
    expect(screen.getByText(/1 column mapped/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run import' })).toBeEnabled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ImportRunStep — clicking run — fires the mapped import', async () => {
    // Arrange
    const mutate = jest.fn();
    mockStart({ mutate } as Partial<ReturnType<typeof useStartImport>>);
    mockStatus(undefined);
    renderStep();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Run import' }));

    // Assert
    expect(mutate).toHaveBeenCalledWith(
      { file: FILE, objectType: 'Request', mapping: MAPPING, mode: 'create' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('ImportRunStep — error starting — shows an alert', () => {
    mockStart({ isError: true, error: new Error('boom') } as Partial<
      ReturnType<typeof useStartImport>
    >);
    mockStatus(undefined);
    renderStep();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('ImportRunStep — a polled job with flagged rows — shows status and the report', async () => {
    // Arrange — mutate immediately reports success so the status block renders.
    const mutate = jest.fn((_vars, opts?: { onSuccess?: (r: { importId: string }) => void }) =>
      opts?.onSuccess?.({ importId: 'imp-1' }),
    );
    mockStart({ mutate } as unknown as Partial<ReturnType<typeof useStartImport>>);
    mockStatus(JOB);
    const { container } = renderStep();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Run import' }));

    // Assert
    expect(screen.getByText(/Completed with issues/)).toBeInTheDocument();
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ImportRunStep — a completed job — reports created and updated counts', async () => {
    // Arrange — mutate immediately reports success so the status block renders.
    const mutate = jest.fn((_vars, opts?: { onSuccess?: (r: { importId: string }) => void }) =>
      opts?.onSuccess?.({ importId: 'imp-2' }),
    );
    mockStart({ mutate } as unknown as Partial<ReturnType<typeof useStartImport>>);
    mockStatus(COMPLETED_JOB);
    const { container } = renderStep();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Run import' }));

    // Assert
    expect(screen.getByText('Completed — 3 created, 2 updated.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ImportRunStep — CompletedWithErrors — reports created, updated, and flagged counts', async () => {
    // Arrange
    const mutate = jest.fn((_vars, opts?: { onSuccess?: (r: { importId: string }) => void }) =>
      opts?.onSuccess?.({ importId: 'imp-1' }),
    );
    mockStart({ mutate } as unknown as Partial<ReturnType<typeof useStartImport>>);
    mockStatus(JOB);
    renderStep();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Run import' }));

    // Assert
    expect(
      screen.getByText('Completed with issues — 2 created, 0 updated, 1 flagged.'),
    ).toBeInTheDocument();
  });

  it('ImportRunStep — upsert mode — shows conditional copy and passes mode to the mutation', async () => {
    // Arrange
    const mutate = jest.fn();
    mockStart({ mutate } as Partial<ReturnType<typeof useStartImport>>);
    mockStatus(undefined);
    const { container } = renderStep('upsert');

    // Assert — pre-run copy explains upsert matching before the run even happens.
    expect(
      screen.getByText(
        /Rows with a Record ID update existing records; rows without one are created\./,
      ),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Run import' }));

    // Assert — the mode prop rides through to the mutation, not a hardcoded 'create'.
    expect(mutate).toHaveBeenCalledWith(
      { file: FILE, objectType: 'Request', mapping: MAPPING, mode: 'upsert' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
