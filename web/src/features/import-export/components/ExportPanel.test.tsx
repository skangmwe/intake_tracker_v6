// Tests for ExportPanel — pick a saved view and download it as CSV. useSavedViews, the export api, and
// the blob-save util are mocked at the boundary. Covers the loading / error / empty / list states and
// the export → download action, with jest-axe across each meaningfully different state.

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { SavedViewDto, WorkspaceId } from '@shared/types';

import { useSavedViews } from '@/features/saved-views';
import { saveBlob } from '@/shared/http/download';

import { renderWithProviders } from '@/test-utils';

import { exportView } from '../api';
import { ExportPanel } from './ExportPanel';

jest.mock('@/features/saved-views');
jest.mock('../api');
jest.mock('@/shared/http/download');

const mockedUseSavedViews = useSavedViews as jest.MockedFunction<typeof useSavedViews>;
const mockedExport = exportView as jest.MockedFunction<typeof exportView>;
const mockedSave = saveBlob as jest.MockedFunction<typeof saveBlob>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;

// Minimal saved-view fixtures — only the fields ExportPanel reads (id / name).
const VIEWS = [
  { id: '5a5e0000-0000-4000-8000-000000000001', name: 'All open requests' },
  { id: '5a5e0000-0000-4000-8000-000000000002', name: 'Unassigned' },
] as unknown as SavedViewDto[];

function mockViews(state: { data?: SavedViewDto[]; isLoading?: boolean; isError?: boolean }) {
  mockedUseSavedViews.mockReturnValue({
    data: state.data,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
  } as ReturnType<typeof useSavedViews>);
}

beforeEach(() => jest.clearAllMocks());

describe('ExportPanel', () => {
  it('shows a loading state with no axe violations', async () => {
    mockViews({ isLoading: true });
    const { container } = renderWithProviders(<ExportPanel workspaceId={WORKSPACE} />);
    expect(screen.getByText('Loading saved views…')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows an error state', async () => {
    mockViews({ isError: true });
    const { container } = renderWithProviders(<ExportPanel workspaceId={WORKSPACE} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the empty state when there are no saved views', async () => {
    mockViews({ data: [] });
    const { container } = renderWithProviders(<ExportPanel workspaceId={WORKSPACE} />);
    expect(screen.getByText(/No saved views yet/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('exports the selected view and downloads it', async () => {
    // Arrange
    mockViews({ data: VIEWS });
    mockedExport.mockResolvedValue(new Blob(['csv']));
    const { container } = renderWithProviders(<ExportPanel workspaceId={WORKSPACE} />);

    // Act — pick the second view and export.
    await userEvent.selectOptions(screen.getByLabelText('Saved view'), VIEWS[1]!.id);
    await userEvent.click(screen.getByRole('button', { name: 'Export view' }));

    // Assert
    await waitFor(() => expect(screen.getByText('Your export has downloaded.')).toBeInTheDocument());
    expect(mockedExport).toHaveBeenCalledWith(VIEWS[1]!.id);
    expect(mockedSave).toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });
});
