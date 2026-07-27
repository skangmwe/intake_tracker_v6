// Tests for ImportExportPage — the S28 surface's loading / error / no-access (non-admin) / admin gates
// and the Import/Export tabs. useMe is mocked to drive each state; the wizard + panel children are
// mocked so this test focuses on the gate + tab switching. jest-axe runs on every rendered state.

import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useMe } from '@/features/users/useMe';

import { renderWithProviders, buildMe, buildMembership } from '@/test-utils';

import { ImportExportPage } from './ImportExportPage';

jest.mock('@/features/users/useMe');
jest.mock('./ImportWizard', () => ({ ImportWizard: () => <div>import-wizard</div> }));
jest.mock('./ExportWizard', () => ({ ExportWizard: () => <div>export-wizard</div> }));
jest.mock('./ExportPanel', () => ({ ExportPanel: () => <div>export-panel</div> }));

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;

function mockMe(state: Partial<ReturnType<typeof useMe>>) {
  mockedUseMe.mockReturnValue(state as ReturnType<typeof useMe>);
}

function mockAdmin() {
  mockMe({
    isLoading: false,
    isError: false,
    data: buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] }),
  });
}

beforeEach(() => jest.clearAllMocks());

describe('ImportExportPage', () => {
  it('shows a loading state', async () => {
    mockMe({ isLoading: true, isError: false, data: undefined });
    const { container } = renderWithProviders(<ImportExportPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows an error state', async () => {
    mockMe({ isLoading: false, isError: true, data: undefined });
    const { container } = renderWithProviders(<ImportExportPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('blocks a non-admin with an explanatory alert and no wizards', async () => {
    mockMe({
      isLoading: false,
      isError: false,
      data: buildMe({ memberships: [buildMembership({ level: 'Member' })] }),
    });
    const { container } = renderWithProviders(<ImportExportPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/workspace admins/);
    expect(screen.queryByText('import-wizard')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the import wizard by default for a workspace admin', async () => {
    mockAdmin();
    const { container } = renderWithProviders(<ImportExportPage />);
    expect(screen.getByRole('tab', { name: 'Import' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('import-wizard')).toBeInTheDocument();
    expect(screen.queryByText('export-wizard')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('switches to the Export tab and shows the wizard + saved-view panel', async () => {
    mockAdmin();
    const { container } = renderWithProviders(<ImportExportPage />);

    await userEvent.click(screen.getByRole('tab', { name: 'Export' }));

    expect(screen.getByText('export-wizard')).toBeInTheDocument();
    expect(screen.getByText('export-panel')).toBeInTheDocument();
    expect(screen.queryByText('import-wizard')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
