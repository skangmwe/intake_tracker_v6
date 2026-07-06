// Tests for ImportPanel — the CSV upload area + live status + per-row report. The api module is mocked
// at the boundary; the panel's behaviour (disabled-until-file, upload → status → report, error state) is
// under test. jest-axe runs across the initial, result, and error states.

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ImportStartResponse, ImportStatusDto, WorkspaceId } from '@shared/types';
import { ApiError } from '@/shared/http/apiClient';

import { renderWithProviders } from '@/test-utils';

import { fetchImportStatus, startImport } from '../api';
import { ImportPanel } from './ImportPanel';

jest.mock('../api');
const mockedStart = startImport as jest.MockedFunction<typeof startImport>;
const mockedStatus = fetchImportStatus as jest.MockedFunction<typeof fetchImportStatus>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;

const COMPLETED_WITH_ERRORS: ImportStatusDto = {
  id: 'imp-1' as ImportStatusDto['id'],
  workspaceId: WORKSPACE as ImportStatusDto['workspaceId'],
  startedBy: 'u-1' as ImportStatusDto['startedBy'],
  startedAt: '2026-07-06T10:00:00Z',
  status: 'CompletedWithErrors',
  totalRows: 3,
  landedRows: 2,
  flaggedRows: [{ rowIndex: 3, reasons: [{ code: 'missing-required', message: 'A request name is required.', field: 'name' }] }],
};

function csv() {
  return new File(['Name\nAlpha'], 'import.csv', { type: 'text/csv' });
}

beforeEach(() => jest.clearAllMocks());

describe('ImportPanel', () => {
  it('disables the button until a file is chosen', async () => {
    // Arrange
    const { container } = renderWithProviders(<ImportPanel workspaceId={WORKSPACE} />);

    // Assert — no file yet.
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();

    // Act — choosing a file enables it.
    await userEvent.upload(screen.getByLabelText('CSV file'), csv());
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeEnabled();
  });

  it('uploads, polls the status, and renders the per-row report', async () => {
    // Arrange
    mockedStart.mockResolvedValue({ importId: 'imp-1' as ImportStartResponse['importId'], status: 'Processing' });
    mockedStatus.mockResolvedValue(COMPLETED_WITH_ERRORS);
    const { container } = renderWithProviders(<ImportPanel workspaceId={WORKSPACE} />);

    // Act
    await userEvent.upload(screen.getByLabelText('CSV file'), csv());
    await userEvent.click(screen.getByRole('button', { name: 'Import CSV' }));

    // Assert — the summary + the flagged row surface.
    await waitFor(() => expect(screen.getByText(/Completed with issues/)).toBeInTheDocument());
    expect(screen.getByText('A request name is required.')).toBeInTheDocument();
    expect(mockedStart).toHaveBeenCalledWith(WORKSPACE, expect.any(File));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('surfaces an error when the upload fails', async () => {
    // Arrange
    mockedStart.mockRejectedValue(
      new ApiError(502, { type: 'x', title: 'Upload failed.', status: 502, detail: 'The file could not be stored.' }),
    );
    const { container } = renderWithProviders(<ImportPanel workspaceId={WORKSPACE} />);

    // Act
    await userEvent.upload(screen.getByLabelText('CSV file'), csv());
    await userEvent.click(screen.getByRole('button', { name: 'Import CSV' }));

    // Assert
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });
});
