// Tests for ImportRunStep — the wizard's review + run step. The hooks are mocked at the boundary so the
// step's own behaviour is under test: the review summary, firing the mapped import, and rendering the
// status line + per-row report once a job is polled. jest-axe across the idle and result states.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ImportStatusDto, WorkspaceId } from '@shared/types';

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

beforeEach(() => jest.clearAllMocks());

function renderStep() {
  return render(
    <ImportRunStep
      workspaceId={WORKSPACE}
      file={FILE}
      objectType="Request"
      objectLabel="Requests"
      mapping={MAPPING}
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
});
