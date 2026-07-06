// Tests for ImportExportPage — the S28 surface's loading / error / no-access (non-admin) / admin gates.
// useMe is mocked to drive each state; the child panels are mocked so this test focuses on the gate.
// jest-axe runs on every rendered state.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';

import { useMe } from '@/features/users/useMe';

import { buildMe, buildMembership } from '@/test-utils';

import { ImportExportPage } from './ImportExportPage';

jest.mock('@/features/users/useMe');
jest.mock('./ImportPanel', () => ({ ImportPanel: () => <div>import-panel</div> }));
jest.mock('./ExportPanel', () => ({ ExportPanel: () => <div>export-panel</div> }));

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;

function mockMe(state: Partial<ReturnType<typeof useMe>>) {
  mockedUseMe.mockReturnValue(state as ReturnType<typeof useMe>);
}

beforeEach(() => jest.clearAllMocks());

describe('ImportExportPage', () => {
  it('shows a loading state', async () => {
    mockMe({ isLoading: true, isError: false, data: undefined });
    const { container } = render(<ImportExportPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows an error state', async () => {
    mockMe({ isLoading: false, isError: true, data: undefined });
    const { container } = render(<ImportExportPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('blocks a non-admin with an explanatory alert and no panels', async () => {
    mockMe({
      isLoading: false,
      isError: false,
      data: buildMe({ memberships: [buildMembership({ level: 'Member' })] }),
    });
    const { container } = render(<ImportExportPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/workspace admins/);
    expect(screen.queryByText('import-panel')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders both panels for a workspace admin', async () => {
    mockMe({
      isLoading: false,
      isError: false,
      data: buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] }),
    });
    const { container } = render(<ImportExportPage />);
    expect(screen.getByText('import-panel')).toBeInTheDocument();
    expect(screen.getByText('export-panel')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
