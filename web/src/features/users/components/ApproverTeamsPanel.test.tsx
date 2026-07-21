// ApproverTeamsPanel — the S29 Approver-teams editor shell. Drives the loading / error / loaded
// states, the create-team bar (disabled-when-empty, success clears the field, error surfaces an
// alert), and that one card renders per team. The child ApproverTeamCard is mocked here — its own
// interactions live in ApproverTeamCard.test.tsx. jest-axe runs against each rendered state
// (web-testing.md accessibility requirement).

import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseQueryResult } from '@tanstack/react-query';

import type { LifecycleConfigDto, ProblemDetails } from '@shared/types';

import { buildLifecycleConfig, buildMembership, renderWithProviders } from '@/test-utils';

import { useCreateApproverTeam, useLifecycleConfig } from '@/features/lifecycle';
import { ApiError } from '@/shared/http/apiClient';

import { ApproverTeamsPanel } from './ApproverTeamsPanel';

// Focus the panel: stub the card so we don't pull in its four mutation hooks.
jest.mock('./ApproverTeamCard', () => ({
  ApproverTeamCard: ({ team, gateUses }: { team: { roleLabel: string }; gateUses: number }) => (
    <li data-testid="team-card">
      {team.roleLabel} · {gateUses}
    </li>
  ),
}));

jest.mock('@/features/lifecycle', () => ({
  useLifecycleConfig: jest.fn(),
  useCreateApproverTeam: jest.fn(),
}));

// The panel sources active members for the typeahead; the card (mocked below) is what consumes them.
jest.mock('../useMembers', () => ({ useMembers: () => ({ data: { members: [] } }) }));

const mockedConfig = useLifecycleConfig as jest.MockedFunction<typeof useLifecycleConfig>;
const mockedCreate = useCreateApproverTeam as jest.MockedFunction<typeof useCreateApproverTeam>;

const workspaceId = buildMembership().workspaceId;

function queryStub(partial: Partial<UseQueryResult<LifecycleConfigDto>>): UseQueryResult<LifecycleConfigDto> {
  return partial as UseQueryResult<LifecycleConfigDto>;
}

// A create-team mutation stub whose `mutate` invokes the caller's onSuccess/onError callback.
function createStub(behaviour: 'success' | { error: ApiError } = 'success') {
  const mutate = jest.fn((_vars: unknown, opts?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => {
    if (behaviour === 'success') opts?.onSuccess?.();
    else opts?.onError?.(behaviour.error);
  });
  mockedCreate.mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof useCreateApproverTeam>);
  return mutate;
}

beforeEach(() => {
  jest.clearAllMocks();
  createStub('success');
});

describe('ApproverTeamsPanel', () => {
  it('ApproverTeamsPanel — config loading — shows the loading state', async () => {
    // Arrange
    mockedConfig.mockReturnValue(queryStub({ data: undefined, isLoading: true, isError: false }));

    // Act
    const { container } = renderWithProviders(<ApproverTeamsPanel workspaceId={workspaceId} />);

    // Assert
    expect(screen.getByText(/loading approver teams/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ApproverTeamsPanel — config errors — shows the error state', async () => {
    // Arrange
    mockedConfig.mockReturnValue(queryStub({ data: undefined, isLoading: false, isError: true }));

    // Act
    const { container } = renderWithProviders(<ApproverTeamsPanel workspaceId={workspaceId} />);

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/approver teams could not be loaded/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ApproverTeamsPanel — loaded — renders the create bar, the note, and one card per team', async () => {
    // Arrange
    mockedConfig.mockReturnValue(
      queryStub({
        data: buildLifecycleConfig({
          approverTeams: [
            { roleLabel: 'InfoSec', roleLabelId: 'r1', members: [] },
            { roleLabel: 'GCO', roleLabelId: 'r2', members: [] },
          ],
        }),
        isLoading: false,
        isError: false,
      }),
    );

    // Act
    const { container } = renderWithProviders(<ApproverTeamsPanel workspaceId={workspaceId} />);

    // Assert
    expect(screen.getByText('New approver team')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add team/i })).toBeInTheDocument();
    expect(screen.getByText(/groups that fill gate slots/i)).toBeInTheDocument();
    expect(screen.getAllByTestId('team-card')).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ApproverTeamsPanel — Add team disabled until a name is typed', async () => {
    // Arrange
    mockedConfig.mockReturnValue(
      queryStub({ data: buildLifecycleConfig({ approverTeams: [] }), isLoading: false, isError: false }),
    );
    const user = userEvent.setup();

    // Act
    renderWithProviders(<ApproverTeamsPanel workspaceId={workspaceId} />);

    // Assert — empty → disabled; typing enables it.
    expect(screen.getByRole('button', { name: /add team/i })).toBeDisabled();
    await user.type(screen.getByLabelText('New approver team name'), 'Model Risk');
    expect(screen.getByRole('button', { name: /add team/i })).toBeEnabled();
  });

  it('ApproverTeamsPanel — create success — calls the mutation and clears the field', async () => {
    // Arrange
    mockedConfig.mockReturnValue(
      queryStub({ data: buildLifecycleConfig({ approverTeams: [] }), isLoading: false, isError: false }),
    );
    const mutate = createStub('success');
    const user = userEvent.setup();
    renderWithProviders(<ApproverTeamsPanel workspaceId={workspaceId} />);
    const input = screen.getByLabelText('New approver team name');

    // Act
    await user.type(input, 'Model Risk');
    await user.click(screen.getByRole('button', { name: /add team/i }));

    // Assert
    expect(mutate).toHaveBeenCalledWith({ label: 'Model Risk' }, expect.anything());
    expect(input).toHaveValue('');
  });

  it('ApproverTeamsPanel — create conflict — surfaces the API error message', async () => {
    // Arrange
    mockedConfig.mockReturnValue(
      queryStub({ data: buildLifecycleConfig({ approverTeams: [] }), isLoading: false, isError: false }),
    );
    const problem: ProblemDetails = {
      type: 'https://mws.ai/errors/conflict',
      title: 'The request conflicts with the current state.',
      status: 409,
      detail: 'A team with that name already exists.',
    };
    createStub({ error: new ApiError(409, problem) });
    const user = userEvent.setup();
    const { container } = renderWithProviders(<ApproverTeamsPanel workspaceId={workspaceId} />);

    // Act
    await user.type(screen.getByLabelText('New approver team name'), 'GCO');
    await user.click(screen.getByRole('button', { name: /add team/i }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);
    expect(await axe(container)).toHaveNoViolations();
  });
});
