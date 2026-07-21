// ApproverTeamCard — one team card on S29 Approver teams. Covers the usage label (plural / singular
// / unused), member rows (avatar initials + name + email + remove), the add-a-person flow (success
// clears the field, error surfaces an alert), inline rename (commit on blur, no-op when unchanged),
// delete, and the retired-label case (read-only name, no delete). The four mutation hooks are mocked;
// jest-axe runs against each meaningfully different rendered state (web-testing.md).

import { axe } from 'jest-axe';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ApproverTeamDto, ProblemDetails, UserId, WorkspaceId } from '@shared/types';

import { ApiError } from '@/shared/http/apiClient';
import {
  useAddApproverMember,
  useDeleteApproverTeam,
  useRemoveApproverMember,
  useRenameApproverTeam,
} from '@/features/lifecycle';

import { ApproverTeamCard } from './ApproverTeamCard';

jest.mock('@/features/lifecycle', () => ({
  useAddApproverMember: jest.fn(),
  useRemoveApproverMember: jest.fn(),
  useRenameApproverTeam: jest.fn(),
  useDeleteApproverTeam: jest.fn(),
}));

const mockedAdd = useAddApproverMember as jest.MockedFunction<typeof useAddApproverMember>;
const mockedRemove = useRemoveApproverMember as jest.MockedFunction<typeof useRemoveApproverMember>;
const mockedRename = useRenameApproverTeam as jest.MockedFunction<typeof useRenameApproverTeam>;
const mockedDelete = useDeleteApproverTeam as jest.MockedFunction<typeof useDeleteApproverTeam>;

type MutateOpts = { onSuccess?: () => void; onError?: (error: unknown) => void };

// A mutate stub that runs the caller's onSuccess (or onError, when an error is configured).
function mutateStub(error?: ApiError) {
  return jest.fn((_vars: unknown, opts?: MutateOpts) => {
    if (error) opts?.onError?.(error);
    else opts?.onSuccess?.();
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a partial mutation result is enough for these tests.
const asHook = (fns: Record<string, jest.Mock>) => ({ ...fns, isPending: false }) as any;

// Add uses mutateAsync (the combobox awaits it to clear its field); the other actions use mutate.
let addMutateAsync: jest.Mock;
let removeMutate: jest.Mock;
let renameMutate: jest.Mock;
let deleteMutate: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  addMutateAsync = jest.fn().mockResolvedValue(undefined);
  removeMutate = mutateStub();
  renameMutate = mutateStub();
  deleteMutate = mutateStub();
  mockedAdd.mockReturnValue(asHook({ mutate: jest.fn(), mutateAsync: addMutateAsync }));
  mockedRemove.mockReturnValue(asHook({ mutate: removeMutate }));
  mockedRename.mockReturnValue(asHook({ mutate: renameMutate }));
  mockedDelete.mockReturnValue(asHook({ mutate: deleteMutate }));
});

const workspaceId = 'ws-1' as WorkspaceId;
const memberId = '00000000-0000-0000-0000-0000000000a1' as UserId;

function buildTeam(overrides: Partial<ApproverTeamDto> = {}): ApproverTeamDto {
  return {
    roleLabel: 'InfoSec',
    roleLabelId: '00000000-0000-0000-0000-0000000000f1',
    members: [{ userId: memberId, displayName: 'Priya Raman', email: 'priya.raman@example.com' }],
    ...overrides,
  };
}

function renderCard(team: ApproverTeamDto, gateUses = 2) {
  return render(
    <ul>
      <ApproverTeamCard workspaceId={workspaceId} team={team} gateUses={gateUses} />
    </ul>,
  );
}

describe('ApproverTeamCard', () => {
  it('ApproverTeamCard — populated — renders name, usage, and the member row with avatar + email', async () => {
    // Act
    const { container } = renderCard(buildTeam(), 2);

    // Assert
    expect(screen.getByLabelText('Team name')).toHaveValue('InfoSec');
    expect(screen.getByText('Fills 2 gate slots')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete team infosec/i })).toBeInTheDocument();
    expect(screen.getByText('Priya Raman')).toBeInTheDocument();
    expect(screen.getByText('priya.raman@example.com')).toBeInTheDocument();
    expect(screen.getByText('PR')).toBeInTheDocument(); // initials avatar
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ApproverTeamCard — usage label — singular and unused variants', () => {
    // Arrange + Act
    const { rerender } = renderCard(buildTeam(), 1);
    // Assert — singular
    expect(screen.getByText('Fills 1 gate slot')).toBeInTheDocument();

    // Act — zero uses
    rerender(
      <ul>
        <ApproverTeamCard workspaceId={workspaceId} team={buildTeam()} gateUses={0} />
      </ul>,
    );
    // Assert
    expect(screen.getByText('Not used by any gate yet')).toBeInTheDocument();
  });

  it('ApproverTeamCard — no members — shows the empty note', async () => {
    // Act
    const { container } = renderCard(buildTeam({ members: [] }));

    // Assert
    expect(screen.getByText('No members yet')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ApproverTeamCard — retired label (no id) — name is read-only and has no delete', async () => {
    // Act
    const { container } = renderCard(buildTeam({ roleLabel: 'Legacy', roleLabelId: null, members: [] }));

    // Assert
    expect(screen.getByLabelText('Team name')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /delete team/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ApproverTeamCard — add member — calls the mutation and clears the input', async () => {
    // Arrange
    const user = userEvent.setup();
    renderCard(buildTeam());
    const input = screen.getByLabelText('Add member to InfoSec');

    // Act
    await user.type(input, 'Dana Cole');
    await user.click(screen.getByRole('button', { name: /add member/i }));

    // Assert
    expect(addMutateAsync).toHaveBeenCalledWith({ roleLabel: 'InfoSec', person: 'Dana Cole' });
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('ApproverTeamCard — add member error — surfaces the API message', async () => {
    // Arrange — the add mutation reports an unresolved-person error.
    const problem: ProblemDetails = {
      type: 'https://mws.ai/errors/validation',
      title: 'x',
      status: 400,
      detail: 'No active member of this workspace matches that name or email.',
    };
    addMutateAsync = jest.fn().mockRejectedValue(new ApiError(400, problem));
    mockedAdd.mockReturnValue(asHook({ mutate: jest.fn(), mutateAsync: addMutateAsync }));
    const user = userEvent.setup();
    renderCard(buildTeam());

    // Act
    await user.type(screen.getByLabelText('Add member to InfoSec'), 'Nobody');
    await user.click(screen.getByRole('button', { name: /add member/i }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/no active member/i);
  });

  it('ApproverTeamCard — remove member — calls the mutation with the userId', async () => {
    // Arrange
    const user = userEvent.setup();
    renderCard(buildTeam());
    const memberRow = screen.getByText('Priya Raman').closest('li') as HTMLElement;

    // Act
    await user.click(within(memberRow).getByRole('button', { name: /remove priya raman/i }));

    // Assert
    expect(removeMutate).toHaveBeenCalledWith({ roleLabel: 'InfoSec', userId: memberId }, expect.anything());
  });

  it('ApproverTeamCard — rename — commits the changed name on blur', async () => {
    // Arrange
    const user = userEvent.setup();
    renderCard(buildTeam());
    const nameInput = screen.getByLabelText('Team name');

    // Act — clear, type a new name, blur.
    await user.clear(nameInput);
    await user.type(nameInput, 'Information Security');
    await user.tab();

    // Assert
    expect(renameMutate).toHaveBeenCalledWith(
      { roleLabelId: '00000000-0000-0000-0000-0000000000f1', request: { label: 'Information Security' } },
      expect.anything(),
    );
  });

  it('ApproverTeamCard — rename unchanged — does not call the mutation', async () => {
    // Arrange
    const user = userEvent.setup();
    renderCard(buildTeam());

    // Act — focus and blur without changing the value.
    await user.click(screen.getByLabelText('Team name'));
    await user.tab();

    // Assert
    expect(renameMutate).not.toHaveBeenCalled();
  });

  it('ApproverTeamCard — delete team — calls the mutation with the role-label id', async () => {
    // Arrange
    const user = userEvent.setup();
    renderCard(buildTeam());

    // Act
    await user.click(screen.getByRole('button', { name: /delete team infosec/i }));

    // Assert
    expect(deleteMutate).toHaveBeenCalledWith('00000000-0000-0000-0000-0000000000f1', expect.anything());
  });

  it('ApproverTeamCard — rename error — surfaces the message and reverts the name', async () => {
    // Arrange — the rename mutation reports a duplicate-name conflict.
    const problem: ProblemDetails = {
      type: 'https://mws.ai/errors/conflict',
      title: 'x',
      status: 409,
      detail: 'A team with that name already exists.',
    };
    renameMutate = mutateStub(new ApiError(409, problem));
    mockedRename.mockReturnValue(asHook({ mutate: renameMutate }));
    const user = userEvent.setup();
    renderCard(buildTeam());
    const nameInput = screen.getByLabelText('Team name');

    // Act
    await user.clear(nameInput);
    await user.type(nameInput, 'GCO');
    await user.tab();

    // Assert — error shown, and the name reverts to the original.
    expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);
    expect(nameInput).toHaveValue('InfoSec');
  });

  it('ApproverTeamCard — Enter commits the name, Escape reverts it', async () => {
    // Arrange
    const user = userEvent.setup();
    renderCard(buildTeam());
    const nameInput = screen.getByLabelText('Team name');

    // Act — Escape after editing reverts without renaming.
    await user.clear(nameInput);
    await user.type(nameInput, 'Discarded');
    await user.keyboard('{Escape}');
    // Assert
    expect(renameMutate).not.toHaveBeenCalled();
    expect(nameInput).toHaveValue('InfoSec');

    // Act — Enter commits the change.
    await user.clear(nameInput);
    await user.type(nameInput, 'Information Security{Enter}');
    // Assert
    expect(renameMutate).toHaveBeenCalledWith(
      { roleLabelId: '00000000-0000-0000-0000-0000000000f1', request: { label: 'Information Security' } },
      expect.anything(),
    );
  });

  it('ApproverTeamCard — Enter in the add-a-person field submits the add', async () => {
    // Arrange — no member options, so Enter submits the typed free text.
    const user = userEvent.setup();
    renderCard(buildTeam());

    // Act
    await user.type(screen.getByLabelText('Add member to InfoSec'), 'Dana Cole{Enter}');

    // Assert
    expect(addMutateAsync).toHaveBeenCalledWith({ roleLabel: 'InfoSec', person: 'Dana Cole' });
  });

  it('ApproverTeamCard — remove member error — surfaces a message', async () => {
    // Arrange
    const problem: ProblemDetails = {
      type: 'https://mws.ai/errors/server',
      title: 'x',
      status: 500,
      detail: 'The roster could not be updated.',
    };
    removeMutate = mutateStub(new ApiError(500, problem));
    mockedRemove.mockReturnValue(asHook({ mutate: removeMutate }));
    const user = userEvent.setup();
    renderCard(buildTeam());
    const memberRow = screen.getByText('Priya Raman').closest('li') as HTMLElement;

    // Act
    await user.click(within(memberRow).getByRole('button', { name: /remove priya raman/i }));

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/roster could not be updated/i);
  });
});
