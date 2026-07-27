// Tests for the S31 page — loading / error / no-access states and the seeded editor. The data
// hooks are mocked so the orchestration is tested without a network (web-testing.md). useMe is
// mocked at the module level, which also feeds ActiveWorkspaceContext's internal useMe() call, so
// the page's active-workspace gate resolves from the same seeded memberships.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildLifecycleConfig, buildMe, buildMembership } from '@/test-utils';
import { useMe } from '@/features/users/useMe';
import { ActiveWorkspaceProvider } from '@/shared/workspace/ActiveWorkspaceContext';

import * as hooks from '../useLifecycle';
import { LifecyclePage } from './LifecyclePage';

jest.mock('@/features/users/useMe');
jest.mock('../useLifecycle');

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;
const mockedHooks = hooks as jest.Mocked<typeof hooks>;

const adminMe = buildMe({ memberships: [buildMembership({ level: 'WorkspaceAdmin' })] });

function renderPage() {
  return render(
    <ActiveWorkspaceProvider>
      <LifecyclePage />
    </ActiveWorkspaceProvider>,
  );
}

function setConfigHook(overrides: Partial<ReturnType<typeof hooks.useLifecycleConfig>> = {}) {
  mockedHooks.useLifecycleConfig.mockReturnValue({
    data: buildLifecycleConfig(),
    isLoading: false,
    isError: false,
    ...overrides,
  } as ReturnType<typeof hooks.useLifecycleConfig>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseMe.mockReturnValue({ data: adminMe, isLoading: false, isError: false } as ReturnType<typeof useMe>);
  setConfigHook();
  mockedHooks.useSaveLifecycleConfig.mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false, error: null } as never);
  mockedHooks.useAddApproverMember.mockReturnValue({ mutate: jest.fn(), mutateAsync: jest.fn().mockResolvedValue({}), isPending: false, isError: false, error: null } as never);
  mockedHooks.useRemoveApproverMember.mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false, error: null } as never);
});

describe('LifecyclePage', () => {
  it('shows a loading state while the profile loads', () => {
    mockedUseMe.mockReturnValue({ data: undefined, isLoading: true, isError: false } as ReturnType<typeof useMe>);
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent(/loading your workspaces/i);
  });

  it('shows a no-access state when the active workspace is member-only, with no axe violations', async () => {
    // Arrange
    mockedUseMe.mockReturnValue({
      data: buildMe({ memberships: [buildMembership({ level: 'Member' })] }),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMe>);

    // Act
    const { container } = renderPage();

    // Assert
    expect(screen.getByText(/need to be a workspace admin/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows a loading state while the config loads', () => {
    setConfigHook({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByText(/loading the lifecycle configuration/i)).toBeInTheDocument();
  });

  it('shows an error state when the config fails', () => {
    setConfigHook({ data: undefined, isLoading: false, isError: true });
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t load the lifecycle configuration/i);
  });

  it('renders the seeded lifecycle with its stages, gates and teams, with no workspace picker', () => {
    renderPage();
    expect(screen.getByRole('combobox', { name: 'Select lifecycle' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^workspace$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /standard.*default/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Stage 1 name')).toHaveValue('Execution');
    expect(screen.getByDisplayValue('QA readiness gate')).toBeInTheDocument();
    // Approver teams roster surfaces every catalog role.
    const teams = screen.getByRole('list', { name: /infosec members/i });
    expect(within(teams).getByText('N. Varga')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/saved/i);
  });

  it('adds a new lifecycle and selects it', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /new lifecycle/i }));

    // The new lifecycle is selected — its name shows in the editor's name input.
    expect(screen.getByRole('textbox', { name: 'Lifecycle name' })).toHaveValue('New lifecycle');
    // The dropdown now lists two lifecycles (Standard + New lifecycle).
    const selector = screen.getByRole('combobox', { name: 'Select lifecycle' });
    expect(within(selector).getAllByRole('option')).toHaveLength(2);
    expect(within(selector).getByRole('option', { name: 'New lifecycle' })).toBeInTheDocument();
  });

  it('has no axe violations in the seeded state', async () => {
    const { container } = renderPage();
    expect(await axe(container)).toHaveNoViolations();
  });
});
