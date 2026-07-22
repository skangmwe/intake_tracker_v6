// MembersPanel — the S29 Members tab: the membership list plus the collapsible add-member flow and
// the deactivate dialog. The api module is mocked at the boundary; the panel is driven through its
// loading / error / empty / list states, the ADD MEMBER toggle, and the deactivate flow. jest-axe
// runs against each meaningfully different rendered state (web-testing.md accessibility requirement).

import { axe } from 'jest-axe';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { UserId } from '@shared/types';

import { buildInvitation, buildMember, buildMembership, renderWithProviders } from '@/test-utils';

import {
  cancelInvitation,
  deactivateMember,
  fetchMembers,
  setMemberSuspension,
  upsertMember,
} from '../api';
import { MembersPanel } from './MembersPanel';

jest.mock('../api');
const mockedFetchMembers = fetchMembers as jest.MockedFunction<typeof fetchMembers>;
const mockedDeactivate = deactivateMember as jest.MockedFunction<typeof deactivateMember>;
const mockedCancelInvitation = cancelInvitation as jest.MockedFunction<typeof cancelInvitation>;
const mockedSetSuspension = setMemberSuspension as jest.MockedFunction<typeof setMemberSuspension>;
const mockedUpsert = upsertMember as jest.MockedFunction<typeof upsertMember>;

const workspaceId = buildMembership().workspaceId;

beforeEach(() => jest.clearAllMocks());

describe('MembersPanel', () => {
  it('MembersPanel — admin with members — renders the list', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [buildMember({ displayName: 'Ada Byron' })] });

    // Act
    const { container } = renderWithProviders(<MembersPanel workspaceId={workspaceId} />);

    // Assert
    expect(await screen.findByText('Ada Byron')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('MembersPanel — empty workspace — shows the empty message', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [] });

    // Act
    const { container } = renderWithProviders(<MembersPanel workspaceId={workspaceId} />);

    // Assert
    expect(await screen.findByText(/no members yet/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('MembersPanel — list in flight — shows the loading state', async () => {
    // Arrange — a never-resolving fetch keeps the list pending.
    mockedFetchMembers.mockReturnValue(new Promise(() => undefined));

    // Act
    const { container } = renderWithProviders(<MembersPanel workspaceId={workspaceId} />);

    // Assert
    expect(await screen.findByText(/loading members…/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('MembersPanel — list fails — shows the error state', async () => {
    // Arrange
    mockedFetchMembers.mockRejectedValue(new Error('boom'));

    // Act
    renderWithProviders(<MembersPanel workspaceId={workspaceId} />);

    // Assert
    expect(await screen.findByText(/member list could not be loaded/i)).toBeInTheDocument();
  });

  it('MembersPanel — ADD MEMBER opens the add-member modal and closes it', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [] });
    const user = userEvent.setup();
    const { container } = renderWithProviders(<MembersPanel workspaceId={workspaceId} />);
    await screen.findByText(/no members yet/i);
    const toggle = screen.getByRole('button', { name: /add member/i });

    // Act — open
    await user.click(toggle);

    // Assert — the add-member dialog is shown; the trigger declares its dialog popup
    const dialog = await screen.findByRole('dialog', { name: /add member/i });
    expect(screen.getByRole('form', { name: /add a member/i })).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-haspopup', 'dialog');
    expect(await axe(container)).toHaveNoViolations();

    // Act — close via Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Assert — the dialog is gone
    expect(dialog).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /add a member/i })).not.toBeInTheDocument();
  });

  it('MembersPanel — Remove then Cancel — closes the dialog without removing', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [buildMember({ displayName: 'Ada Byron' })] });
    const user = userEvent.setup();
    renderWithProviders(<MembersPanel workspaceId={workspaceId} />);
    await screen.findByText('Ada Byron');

    // Act — Remove from workspace lives in the row's kebab menu; it opens a confirm dialog.
    await user.click(screen.getByRole('button', { name: 'Actions for Ada Byron' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove from workspace' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Assert
    expect(dialog).not.toBeInTheDocument();
    expect(mockedDeactivate).not.toHaveBeenCalled();
  });

  it('MembersPanel — Cancel invitation — cancels the pending invite by id', async () => {
    // Arrange — a pending-invitation row exposes Cancel invitation instead of Deactivate.
    const invitation = buildInvitation({ invitationId: '00000000-0000-0000-0000-0000000000fa' });
    mockedFetchMembers.mockResolvedValue({ members: [invitation] });
    mockedCancelInvitation.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<MembersPanel workspaceId={workspaceId} />);
    await screen.findByText('invitee@mws.ai');

    // Act — Cancel invitation lives in the row's kebab menu.
    await user.click(screen.getByRole('button', { name: 'Actions for invitee@mws.ai' }));
    await user.click(screen.getByRole('menuitem', { name: 'Cancel invitation' }));

    // Assert
    await waitFor(() =>
      expect(mockedCancelInvitation).toHaveBeenCalledWith(workspaceId, invitation.invitationId),
    );
  });

  it('MembersPanel — Remove — opens the dialog and removes the member', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({ members: [buildMember({ displayName: 'Ada Byron' })] });
    mockedDeactivate.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<MembersPanel workspaceId={workspaceId} />);
    await screen.findByText('Ada Byron');

    // Act — open the row kebab, choose Remove from workspace, then confirm.
    await user.click(screen.getByRole('button', { name: 'Actions for Ada Byron' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove from workspace' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Remove Ada Byron' }));

    // Assert
    await waitFor(() => expect(mockedDeactivate).toHaveBeenCalledTimes(1));
    expect(dialog).not.toBeInTheDocument();
  });

  it('MembersPanel — Suspend member — suspends via the API', async () => {
    // Arrange
    const member = buildMember({
      userId: '00000000-0000-0000-0000-0000000000b7' as UserId,
      displayName: 'Ada Byron',
    });
    mockedFetchMembers.mockResolvedValue({ members: [member] });
    mockedSetSuspension.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<MembersPanel workspaceId={workspaceId} />);
    await screen.findByText('Ada Byron');

    // Act — Suspend acts immediately from the kebab (no confirm dialog).
    await user.click(screen.getByRole('button', { name: 'Actions for Ada Byron' }));
    await user.click(screen.getByRole('menuitem', { name: 'Suspend member' }));

    // Assert
    await waitFor(() =>
      expect(mockedSetSuspension).toHaveBeenCalledWith(workspaceId, member.userId, true),
    );
  });

  it('MembersPanel — Edit details — saves the new access level', async () => {
    // Arrange
    const member = buildMember({
      userId: '00000000-0000-0000-0000-0000000000b8' as UserId,
      displayName: 'Ada Byron',
      level: 'Member',
    });
    mockedFetchMembers.mockResolvedValue({ members: [member] });
    mockedUpsert.mockResolvedValue({ outcome: 'Member' });
    const user = userEvent.setup();
    renderWithProviders(<MembersPanel workspaceId={workspaceId} />);
    await screen.findByText('Ada Byron');

    // Act — kebab → Edit details opens the editor; change the level and save.
    await user.click(screen.getByRole('button', { name: 'Actions for Ada Byron' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit details' }));
    await screen.findByRole('dialog');
    await user.selectOptions(screen.getByLabelText('Access level'), 'Viewer');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // Assert
    await waitFor(() =>
      expect(mockedUpsert).toHaveBeenCalledWith(workspaceId, { userId: member.userId, level: 'Viewer' }),
    );
  });

  it('MembersPanel — with members — shows the pagination footer count', async () => {
    // Arrange
    mockedFetchMembers.mockResolvedValue({
      members: [
        buildMember({ userId: '00000000-0000-0000-0000-0000000000a1' as UserId, displayName: 'Ada Byron' }),
        buildMember({ userId: '00000000-0000-0000-0000-0000000000a2' as UserId, displayName: 'Bo Chen' }),
      ],
    });

    // Act
    renderWithProviders(<MembersPanel workspaceId={workspaceId} />);

    // Assert
    expect(await screen.findByText('1–2 of 2 people')).toBeInTheDocument();
  });

  it('MembersPanel — status filter excludes all — shows filtered-to-zero and clears', async () => {
    // Arrange — only an Active member; filtering to Suspended empties the list.
    mockedFetchMembers.mockResolvedValue({ members: [buildMember({ displayName: 'Ada Byron' })] });
    const user = userEvent.setup();
    const { container } = renderWithProviders(<MembersPanel workspaceId={workspaceId} />);
    await screen.findByText('Ada Byron');

    // Act — open the Status funnel and tick Suspended.
    await user.click(screen.getByRole('button', { name: 'Filter Status' }));
    await user.click(screen.getByRole('checkbox', { name: /suspended/i }));

    // Assert — the filtered-to-zero surface appears; jest-axe still clean.
    expect(await screen.findByText(/no members match these filters/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    // Act — clear filters restores the row.
    await user.click(screen.getByRole('button', { name: /clear filters/i }));

    // Assert
    expect(await screen.findByText('Ada Byron')).toBeInTheDocument();
  });
});
